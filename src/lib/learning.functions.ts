import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createLovableGateway } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

const MODEL = "google/gemini-3-flash-preview";

function gateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableGateway(key);
}

function safeJson<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const startA = cleaned.indexOf("[");
    const i = startA !== -1 && (startA < start || start === -1) ? startA : start;
    if (i < 0) return null;
    return JSON.parse(cleaned.slice(i)) as T;
  } catch {
    return null;
  }
}

// ---------------- Extract learning items from a chat turn ----------------

const ExtractInput = z.object({
  conversationId: z.string().uuid(),
  userMessage: z.string().min(1).max(4000),
  assistantMessage: z.string().min(1).max(8000),
});

type ExtractResult = {
  errors: { original: string; correction: string; explanation_pt: string }[];
  vocabulary: { word: string; explanation_pt: string }[];
  phrases: { phrase: string; explanation_pt: string }[];
};

export const extractLearningItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ExtractInput.parse(i))
  .handler(async ({ data, context }) => {
    const prompt = `You analyze one turn of an English conversation between a Brazilian learner and a tutor named Lucas.

USER said (English, may contain mistakes):
"""${data.userMessage}"""

LUCAS replied:
"""${data.assistantMessage}"""

Return STRICT JSON with this shape, no prose:
{
  "errors": [{"original": "<user's wrong fragment>", "correction": "<fixed English>", "explanation_pt": "<short PT-BR why>"}],
  "vocabulary": [{"word": "<single new useful word from Lucas>", "explanation_pt": "<PT-BR meaning>"}],
  "phrases": [{"phrase": "<useful English phrase from Lucas>", "explanation_pt": "<PT-BR meaning>"}]
}

Rules:
- Max 3 items per array. Empty arrays if none.
- Skip trivial typos. Only meaningful grammar/word-choice errors.
- Vocabulary: words a Brazilian intermediate learner likely doesn't know.
- Phrases: idiomatic or naturally-used short expressions (2-6 words).
- Never invent errors. If user's English is fine, errors=[].`;

    let parsed: ExtractResult | null = null;
    try {
      const { text } = await generateText({
        model: gateway()(MODEL),
        prompt,
        temperature: 0.2,
      });
      parsed = safeJson<ExtractResult>(text);
    } catch (e) {
      console.error("[extractLearningItems] gen", e);
      return { inserted: 0 };
    }
    if (!parsed) return { inserted: 0 };

    const rows: Array<{
      user_id: string;
      conversation_id: string;
      kind: "error" | "vocabulary" | "phrase";
      original: string;
      correction: string | null;
      explanation_pt: string | null;
    }> = [];

    for (const e of parsed.errors ?? []) {
      if (!e?.original || !e?.correction) continue;
      rows.push({
        user_id: context.userId,
        conversation_id: data.conversationId,
        kind: "error",
        original: String(e.original).slice(0, 500),
        correction: String(e.correction).slice(0, 500),
        explanation_pt: String(e.explanation_pt ?? "").slice(0, 500) || null,
      });
    }
    for (const v of parsed.vocabulary ?? []) {
      if (!v?.word) continue;
      rows.push({
        user_id: context.userId,
        conversation_id: data.conversationId,
        kind: "vocabulary",
        original: String(v.word).slice(0, 200),
        correction: null,
        explanation_pt: String(v.explanation_pt ?? "").slice(0, 500) || null,
      });
    }
    for (const p of parsed.phrases ?? []) {
      if (!p?.phrase) continue;
      rows.push({
        user_id: context.userId,
        conversation_id: data.conversationId,
        kind: "phrase",
        original: String(p.phrase).slice(0, 300),
        correction: null,
        explanation_pt: String(p.explanation_pt ?? "").slice(0, 500) || null,
      });
    }

    if (rows.length === 0) return { inserted: 0 };
    const { error } = await context.supabase.from("learning_items").insert(rows);
    if (error) {
      console.error("[extractLearningItems] insert", error);
      return { inserted: 0 };
    }
    return { inserted: rows.length };
  });

// ---------------- List learning items ----------------

export const listLearningItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      kind: z.enum(["error", "vocabulary", "phrase"]).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("learning_items")
      .select("id, kind, original, correction, explanation_pt, times_practiced, mastered_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.kind) q = q.eq("kind", data.kind);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------------- Stats ----------------

export const getMyStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_stats")
      .select("xp, streak_days, longest_streak, last_practice_date")
      .eq("user_id", context.userId)
      .maybeSingle();
    const [{ count: errorsCount }, { count: vocabCount }] = await Promise.all([
      context.supabase.from("learning_items").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("kind", "error"),
      context.supabase.from("learning_items").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("kind", "vocabulary"),
    ]);
    return {
      xp: data?.xp ?? 0,
      streak_days: data?.streak_days ?? 0,
      longest_streak: data?.longest_streak ?? 0,
      last_practice_date: data?.last_practice_date ?? null,
      errors_count: errorsCount ?? 0,
      vocabulary_count: vocabCount ?? 0,
    };
  });

// ---------------- Fill-in-the-blank generation ----------------

export type FillBlankItem = {
  sentence: string; // contains "____" placeholder once
  answer: string;
  options: string[]; // includes answer, total 4
  translation_pt: string;
  hint?: string;
};

export const generateFillBlank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ count: z.number().int().min(1).max(10).default(5) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const [{ data: profile }, { data: recentErrors }] = await Promise.all([
      context.supabase.from("user_profiles").select("english_level, main_goal").eq("user_id", context.userId).maybeSingle(),
      context.supabase
        .from("learning_items")
        .select("original, correction, explanation_pt")
        .eq("user_id", context.userId)
        .eq("kind", "error")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    const level = profile?.english_level ?? "intermediate";
    const goal = profile?.main_goal ?? "general conversation";
    const errorsBlock = (recentErrors ?? []).map(
      (e, i) => `${i + 1}. wrong: "${e.original}" → right: "${e.correction}"${e.explanation_pt ? ` (${e.explanation_pt})` : ""}`,
    ).join("\n");

    const prompt = `Generate ${data.count} fill-in-the-blank English exercises for a Brazilian learner.

Learner level: ${level}. Goal context: ${goal}.
${errorsBlock ? `Recent mistakes to reinforce when possible:\n${errorsBlock}` : ""}

Return STRICT JSON array, no prose:
[
  {
    "sentence": "I ____ to the office yesterday.",
    "answer": "went",
    "options": ["went", "go", "gone", "going"],
    "translation_pt": "Eu fui ao escritório ontem.",
    "hint": "Past simple of 'go'"
  }
]

Rules:
- Each "sentence" must contain exactly one "____" placeholder (4 underscores).
- "options" has exactly 4 distinct single-word or short answers, including the correct one.
- Answers must be exact substring that fits the blank. No punctuation in options.
- Mix tenses/prepositions/word-choice. Vary topics.
- Keep sentences natural and short (max 12 words).
- "translation_pt" is the full sentence translated to Brazilian Portuguese.
- "hint" is optional, max 60 chars, in PT-BR.`;

    const { text } = await generateText({
      model: gateway()(MODEL),
      prompt,
      temperature: 0.7,
    });
    const parsed = safeJson<FillBlankItem[]>(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Não foi possível gerar exercícios agora. Tente de novo.");
    }
    // Sanitize
    const cleaned: FillBlankItem[] = parsed
      .filter((p) => p && typeof p.sentence === "string" && p.sentence.includes("____") && typeof p.answer === "string" && Array.isArray(p.options))
      .map((p) => ({
        sentence: p.sentence,
        answer: p.answer,
        options: Array.from(new Set(p.options.map((o) => String(o)))).slice(0, 6),
        translation_pt: String(p.translation_pt ?? ""),
        hint: p.hint ? String(p.hint).slice(0, 80) : undefined,
      }))
      .filter((p) => p.options.includes(p.answer) && p.options.length >= 3);
    if (cleaned.length === 0) throw new Error("Os exercícios gerados vieram inválidos. Tente de novo.");
    return cleaned;
  });

// ---------------- Submit practice result (XP + streak) ----------------

export const submitPracticeResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      activity: z.string().min(1).max(40),
      total: z.number().int().min(1).max(50),
      correct: z.number().int().min(0).max(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const xpEarned = data.correct * 10 + (data.correct === data.total ? 20 : 0);
    const today = new Date().toISOString().slice(0, 10);

    const { data: current } = await context.supabase
      .from("user_stats")
      .select("xp, streak_days, longest_streak, last_practice_date")
      .eq("user_id", context.userId)
      .maybeSingle();

    let streak = current?.streak_days ?? 0;
    const last = current?.last_practice_date ?? null;
    if (last === today) {
      // same day — keep streak
    } else if (last) {
      const lastD = new Date(last + "T00:00:00Z").getTime();
      const todayD = new Date(today + "T00:00:00Z").getTime();
      const diff = Math.round((todayD - lastD) / 86400000);
      streak = diff === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    const longest = Math.max(current?.longest_streak ?? 0, streak);
    const newXp = (current?.xp ?? 0) + xpEarned;

    const { error: upErr } = await context.supabase.from("user_stats").upsert(
      {
        user_id: context.userId,
        xp: newXp,
        streak_days: streak,
        longest_streak: longest,
        last_practice_date: today,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (upErr) throw new Error(upErr.message);

    await context.supabase.from("practice_sessions").insert({
      user_id: context.userId,
      activity: data.activity,
      items_total: data.total,
      items_correct: data.correct,
      xp_earned: xpEarned,
    });

    return { xp: newXp, xp_earned: xpEarned, streak_days: streak, longest_streak: longest };
  });
