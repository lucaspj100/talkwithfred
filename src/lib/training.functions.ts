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
    const i = cleaned.indexOf("{");
    const ai = cleaned.indexOf("[");
    const start = ai !== -1 && (ai < i || i === -1) ? ai : i;
    if (start < 0) return null;
    return JSON.parse(cleaned.slice(start)) as T;
  } catch {
    return null;
  }
}

// ============ Types ============

type ExerciseType =
  | "fill_blank"
  | "order_words"
  | "translate"
  | "natural_choice"
  | "open_response"
  | "vocab_choice"
  | "fix_error";

type SourceType =
  | "conversation_review_item"
  | "learning_error"
  | "vocabulary"
  | "phrase"
  | "general_practice";

type GeneratedExercise = {
  source_type: SourceType;
  source_id: string | null;
  exercise_type: ExerciseType;
  prompt: string;
  instructions?: string | null;
  options?: string[] | null;
  correct_answer: string | null;
  acceptable_answers?: string[] | null;
  explanation_pt?: string | null;
  translation_pt?: string | null;
  hint?: string | null;
};

// ============ Utilities ============

function todayInTz(offsetMinutes: number = 0): string {
  const now = new Date(Date.now() - offsetMinutes * 60000);
  return now.toISOString().slice(0, 10);
}

function normalize(s: string): string {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "'")
    .replace(/\bi'm\b/g, "i am")
    .replace(/\byou're\b/g, "you are")
    .replace(/\bhe's\b/g, "he is")
    .replace(/\bshe's\b/g, "she is")
    .replace(/\bit's\b/g, "it is")
    .replace(/\bwe're\b/g, "we are")
    .replace(/\bthey're\b/g, "they are")
    .replace(/\bdon't\b/g, "do not")
    .replace(/\bdoesn't\b/g, "does not")
    .replace(/\bdidn't\b/g, "did not")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bi've\b/g, "i have")
    .replace(/\byou've\b/g, "you have")
    .replace(/\bi'd\b/g, "i would")
    .replace(/[.,!?;:"()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function localValidate(
  userAnswer: string,
  correct: string | null,
  acceptable: string[] | null | undefined,
): "correct" | "close" | "wrong" {
  if (!correct) return "wrong";
  const u = normalize(userAnswer);
  if (!u) return "wrong";
  const candidates = [correct, ...(acceptable ?? [])].map(normalize).filter(Boolean);
  if (candidates.some((c) => c === u)) return "correct";
  const dist = Math.min(...candidates.map((c) => levenshtein(c, u)));
  const shortest = Math.min(...candidates.map((c) => c.length));
  if (dist <= Math.max(1, Math.floor(shortest * 0.12))) return "close";
  return "wrong";
}

// ============ AI judge for open responses ============

async function aiJudgeOpen(
  prompt: string,
  correctExample: string | null,
  userAnswer: string,
  instructions: string,
): Promise<{ verdict: "correct" | "close" | "wrong"; feedback_pt: string }> {
  try {
    const { text } = await generateText({
      model: gateway()(MODEL),
      temperature: 0.1,
      prompt: `You judge a Brazilian learner's English answer. Return STRICT JSON only:
{"verdict":"correct"|"close"|"wrong","feedback_pt":"<short Portuguese feedback max 120 chars>"}

Exercise instructions: ${instructions}
Prompt: ${prompt}
Example correct answer: ${correctExample ?? "(none)"}
Learner answer: ${userAnswer}

Rules:
- "correct" if meaning + grammar are OK (accept synonyms, contractions, variations).
- "close" if idea is right but minor grammar/word issues.
- "wrong" if meaning is off or grammar breaks the sentence.
- Feedback is short and constructive in PT-BR.`,
    });
    const parsed = safeJson<{ verdict: string; feedback_pt: string }>(text);
    if (!parsed) return { verdict: "wrong", feedback_pt: "Não consegui avaliar. Tente novamente." };
    const v = parsed.verdict === "correct" || parsed.verdict === "close" ? parsed.verdict : "wrong";
    return { verdict: v, feedback_pt: String(parsed.feedback_pt ?? "").slice(0, 200) };
  } catch {
    return { verdict: "wrong", feedback_pt: "Não consegui avaliar agora." };
  }
}

// ============ Content selection ============

type SupabaseClient = ReturnType<typeof requireSupabaseAuth extends never ? never : any>;

async function pickPersonalizedSources(supabase: SupabaseClient, userId: string) {
  // Learning items due for review, prioritized
  const nowIso = new Date().toISOString();
  const { data: learningRows } = await supabase
    .from("learning_items")
    .select("id, kind, original, correction, explanation_pt, mastery_level, correct_streak, incorrect_count, total_attempts, last_practiced_at, next_review_at, active, created_at")
    .eq("user_id", userId)
    .eq("active", true)
    .or(`next_review_at.is.null,next_review_at.lte.${nowIso}`)
    .limit(80);

  // Unresolved review items (not fully done)
  const { data: reviewRows } = await supabase
    .from("conversation_review_items")
    .select("id, type, original_text, corrected_text, natural_text, explanation_pt, translation_pt, importance, exercise_type, exercise_prompt, exercise_options, correct_answer, acceptable_answers, stage")
    .eq("user_id", userId)
    .in("importance", ["high", "medium", "low"])
    .neq("stage", "done")
    .order("importance", { ascending: false })
    .limit(40);

  type L = NonNullable<typeof learningRows>[number];
  type R = NonNullable<typeof reviewRows>[number];

  const errors: L[] = ((learningRows ?? []) as L[]).filter((r) => r.kind === "error");
  const vocab: L[] = ((learningRows ?? []) as L[]).filter((r) => r.kind === "vocabulary");
  const phrases: L[] = ((learningRows ?? []) as L[]).filter((r) => r.kind === "phrase");

  const priority = (r: L): number => {
    const dueBoost = r.next_review_at && new Date(r.next_review_at).getTime() <= Date.now() ? 3 : 0;
    return (r.incorrect_count ?? 0) * 2 + (r.total_attempts ?? 0) * 0.5 - (r.mastery_level ?? 0) * 3 + dueBoost;
  };
  errors.sort((a, b) => priority(b) - priority(a));
  vocab.sort((a, b) => priority(b) - priority(a));
  phrases.sort((a, b) => priority(b) - priority(a));

  return {
    errors,
    vocab,
    phrases,
    reviews: (reviewRows ?? []) as R[],
  };
}

// ============ Exercise generation ============

async function generateExercisesFromSources(
  supabase: SupabaseClient,
  userId: string,
  desired: number,
): Promise<GeneratedExercise[]> {
  const { errors, vocab, phrases, reviews } = await pickPersonalizedSources(supabase, userId);
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("english_level, primary_english_goal, main_goal, primary_professional_area, preferred_situations")
    .eq("user_id", userId)
    .maybeSingle();

  const level = (profile?.english_level as string | null) ?? "intermediate";

  // Target distribution (approx): 40% errors, 20% reviews reinforce, 20% vocab, 20% general
  const nErrors = Math.max(1, Math.round(desired * 0.4));
  const nReviews = Math.round(desired * 0.2);
  const nVocab = Math.round(desired * 0.2);

  const picked: GeneratedExercise[] = [];
  const seenPrompts = new Set<string>();

  function pushUnique(ex: GeneratedExercise) {
    const key = normalize(ex.prompt);
    if (!key || seenPrompts.has(key)) return;
    seenPrompts.add(key);
    picked.push(ex);
  }

  // 1) Reuse ready review items with pre-generated exercises
  for (const r of reviews) {
    if (picked.length >= nReviews) break;
    if (!r.exercise_prompt || !r.correct_answer) continue;
    pushUnique({
      source_type: "conversation_review_item",
      source_id: r.id,
      exercise_type: (r.exercise_type === "multiple_choice" ? "natural_choice" : (r.exercise_type as ExerciseType)) ?? "fill_blank",
      prompt: r.exercise_prompt,
      options: (r.exercise_options as string[] | null) ?? null,
      correct_answer: r.correct_answer,
      acceptable_answers: (r.acceptable_answers as string[] | null) ?? null,
      explanation_pt: r.explanation_pt ?? null,
      translation_pt: r.translation_pt ?? null,
    });
  }

  // 2) AI-generate exercises for personal errors
  const errorsForAi = errors.slice(0, Math.min(6, nErrors + 2));
  if (errorsForAi.length > 0) {
    const errorBlock = errorsForAi
      .map((e, i) => `${i + 1}. wrong: "${e.original}" → right: "${e.correction ?? ""}"${e.explanation_pt ? ` (${e.explanation_pt})` : ""}`)
      .join("\n");
    const promptAi = `Generate ${errorsForAi.length} English exercises for a Brazilian learner (level: ${level}) based on their recent mistakes.

Mistakes:
${errorBlock}

Return STRICT JSON array only:
[
  {
    "exercise_type": "fill_blank" | "translate" | "natural_choice" | "fix_error" | "order_words",
    "prompt": "<sentence with ____ for fill_blank; PT sentence for translate; two options for natural_choice as A: ... / B: ...; wrong English for fix_error; shuffled words joined by ' / ' for order_words>",
    "instructions": "<short PT-BR instruction>",
    "options": ["opt1","opt2","opt3","opt4"] | null,
    "correct_answer": "<expected English answer>",
    "acceptable_answers": ["alt1","alt2"] | null,
    "explanation_pt": "<why the correct answer is right, PT-BR, short>",
    "translation_pt": "<PT-BR translation of the correct sentence>",
    "hint": "<short PT-BR hint>",
    "source_index": <1-based index of the mistake this reinforces>
  }
]

Rules:
- Vary exercise types across items.
- fill_blank: sentence contains exactly one "____" placeholder, options has 4 distinct single-word or short answers including correct.
- natural_choice: options has exactly 2 items (both English sentences). correct_answer must equal one of them.
- order_words: correct_answer is the full correct sentence; prompt lists the words shuffled joined by " / ".
- fix_error: prompt is the incorrect sentence; correct_answer is the fixed sentence.
- translate: prompt is the PT-BR sentence to translate to English; correct_answer is the English sentence; acceptable_answers lists 1-3 valid variations.
- Never mention the learner or the analysis process in the prompt/instructions.
- Keep sentences natural, short (max 14 words).`;
    try {
      const { text } = await generateText({ model: gateway()(MODEL), prompt: promptAi, temperature: 0.6 });
      const arr = safeJson<Array<Record<string, unknown>>>(text);
      if (Array.isArray(arr)) {
        for (const raw of arr) {
          if (picked.length >= nReviews + nErrors + 2) break;
          const t = String(raw.exercise_type ?? "");
          const allowed: ExerciseType[] = ["fill_blank", "translate", "natural_choice", "fix_error", "order_words"];
          if (!allowed.includes(t as ExerciseType)) continue;
          const idx = Number(raw.source_index ?? 0) - 1;
          const src = errorsForAi[idx] ?? errorsForAi[0];
          pushUnique({
            source_type: "learning_error",
            source_id: src?.id ?? null,
            exercise_type: t as ExerciseType,
            prompt: String(raw.prompt ?? "").slice(0, 400),
            instructions: raw.instructions ? String(raw.instructions).slice(0, 200) : null,
            options: Array.isArray(raw.options) ? (raw.options as unknown[]).map(String).slice(0, 6) : null,
            correct_answer: raw.correct_answer ? String(raw.correct_answer).slice(0, 300) : null,
            acceptable_answers: Array.isArray(raw.acceptable_answers) ? (raw.acceptable_answers as unknown[]).map(String).slice(0, 6) : null,
            explanation_pt: raw.explanation_pt ? String(raw.explanation_pt).slice(0, 300) : null,
            translation_pt: raw.translation_pt ? String(raw.translation_pt).slice(0, 300) : null,
            hint: raw.hint ? String(raw.hint).slice(0, 120) : null,
          });
        }
      }
    } catch (e) {
      console.error("[training] ai errors", e);
    }
  }

  // 3) Vocabulary exercises
  const vocabForAi = vocab.slice(0, Math.max(nVocab, 2));
  if (vocabForAi.length > 0) {
    const vocabBlock = vocabForAi.map((v, i) => `${i + 1}. ${v.original}${v.explanation_pt ? ` — ${v.explanation_pt}` : ""}`).join("\n");
    const promptAi = `Generate ${vocabForAi.length} vocabulary practice exercises for a Brazilian learner (level: ${level}).

Words:
${vocabBlock}

Return STRICT JSON array only:
[
  {
    "exercise_type": "vocab_choice",
    "prompt": "<English sentence with ____ where this word fits naturally>",
    "instructions": "Escolha a palavra que completa a frase.",
    "options": ["<correct word>","<distractor1>","<distractor2>","<distractor3>"],
    "correct_answer": "<the word>",
    "translation_pt": "<PT-BR translation of the full sentence>",
    "explanation_pt": "<PT-BR short meaning>",
    "source_index": <1-based>
  }
]
- Distractors must be plausible but wrong.
- Keep sentences short.`;
    try {
      const { text } = await generateText({ model: gateway()(MODEL), prompt: promptAi, temperature: 0.7 });
      const arr = safeJson<Array<Record<string, unknown>>>(text);
      if (Array.isArray(arr)) {
        for (const raw of arr) {
          if (picked.length >= nReviews + nErrors + nVocab + 2) break;
          const idx = Number(raw.source_index ?? 0) - 1;
          const src = vocabForAi[idx] ?? vocabForAi[0];
          pushUnique({
            source_type: "vocabulary",
            source_id: src?.id ?? null,
            exercise_type: "vocab_choice",
            prompt: String(raw.prompt ?? "").slice(0, 400),
            instructions: raw.instructions ? String(raw.instructions) : "Escolha a palavra que completa a frase.",
            options: Array.isArray(raw.options) ? (raw.options as unknown[]).map(String).slice(0, 6) : null,
            correct_answer: raw.correct_answer ? String(raw.correct_answer) : (src?.original ?? null),
            explanation_pt: raw.explanation_pt ? String(raw.explanation_pt).slice(0, 300) : (src?.explanation_pt ?? null),
            translation_pt: raw.translation_pt ? String(raw.translation_pt).slice(0, 300) : null,
          });
        }
      }
    } catch (e) {
      console.error("[training] ai vocab", e);
    }
  }

  // 4) Fill remainder with general practice
  const remaining = desired - picked.length;
  if (remaining > 0) {
    const promptAi = `Generate ${remaining} general English practice exercises for a Brazilian learner (level: ${level}).
Return STRICT JSON array only, using varied exercise types:
[
  {
    "exercise_type": "fill_blank" | "translate" | "natural_choice" | "order_words",
    "prompt": "<...>",
    "instructions": "<PT-BR>",
    "options": [...] | null,
    "correct_answer": "<...>",
    "acceptable_answers": [...] | null,
    "translation_pt": "<...>",
    "explanation_pt": "<...>",
    "hint": "<...>"
  }
]
Rules same as before. Keep them natural and at level "${level}".`;
    try {
      const { text } = await generateText({ model: gateway()(MODEL), prompt: promptAi, temperature: 0.7 });
      const arr = safeJson<Array<Record<string, unknown>>>(text);
      if (Array.isArray(arr)) {
        for (const raw of arr) {
          if (picked.length >= desired) break;
          const t = String(raw.exercise_type ?? "");
          const allowed: ExerciseType[] = ["fill_blank", "translate", "natural_choice", "order_words"];
          if (!allowed.includes(t as ExerciseType)) continue;
          pushUnique({
            source_type: "general_practice",
            source_id: null,
            exercise_type: t as ExerciseType,
            prompt: String(raw.prompt ?? "").slice(0, 400),
            instructions: raw.instructions ? String(raw.instructions).slice(0, 200) : null,
            options: Array.isArray(raw.options) ? (raw.options as unknown[]).map(String).slice(0, 6) : null,
            correct_answer: raw.correct_answer ? String(raw.correct_answer).slice(0, 300) : null,
            acceptable_answers: Array.isArray(raw.acceptable_answers) ? (raw.acceptable_answers as unknown[]).map(String).slice(0, 6) : null,
            explanation_pt: raw.explanation_pt ? String(raw.explanation_pt).slice(0, 300) : null,
            translation_pt: raw.translation_pt ? String(raw.translation_pt).slice(0, 300) : null,
            hint: raw.hint ? String(raw.hint).slice(0, 120) : null,
          });
        }
      }
    } catch (e) {
      console.error("[training] ai general", e);
    }
  }

  // Sanitize: drop items without correct_answer or invalid options
  const cleaned = picked.filter((p) => {
    if (!p.correct_answer) return false;
    if (p.exercise_type === "fill_blank" || p.exercise_type === "vocab_choice") {
      if (!Array.isArray(p.options) || p.options.length < 3) return false;
      if (!p.options.includes(p.correct_answer)) return false;
    }
    if (p.exercise_type === "natural_choice") {
      if (!Array.isArray(p.options) || p.options.length !== 2) return false;
      if (!p.options.includes(p.correct_answer)) return false;
    }
    return true;
  });

  return cleaned.slice(0, desired);
}

// ============ Server functions ============

/**
 * Idempotent: creates (once) the main training for the user for today.
 * Returns session with items.
 */
export const getOrCreateTodayTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        desired: z.number().int().min(5).max(10).default(7),
        tzOffsetMinutes: z.number().int().min(-720).max(840).default(0),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const trainingDate = todayInTz(data.tzOffsetMinutes);
    const { data: existing } = await context.supabase
      .from("daily_training_sessions")
      .select("id, status, total_items, completed_items, correct_items, estimated_minutes, training_date, started_at, completed_at, created_at")
      .eq("user_id", context.userId)
      .eq("training_date", trainingDate)
      .eq("is_extra", false)
      .maybeSingle();

    if (existing && existing.total_items > 0) {
      const { data: items } = await context.supabase
        .from("daily_training_items")
        .select("*")
        .eq("session_id", existing.id)
        .order("display_order", { ascending: true });
      return { session: existing, items: items ?? [] };
    }

    // Create session row first to lock in idempotency
    const sessionId = existing?.id
      ? existing.id
      : (
          await context.supabase
            .from("daily_training_sessions")
            .insert({ user_id: context.userId, training_date: trainingDate, status: "ready", estimated_minutes: 5 })
            .select("id")
            .single()
        ).data?.id;

    if (!sessionId) throw new Error("Não foi possível criar o treino de hoje.");

    // Generate exercises
    const exercises = await generateExercisesFromSources(context.supabase, context.userId, data.desired);
    if (exercises.length === 0) throw new Error("Não consegui montar seu treino agora. Tente novamente em instantes.");

    const rows = exercises.map((ex, idx) => ({
      session_id: sessionId,
      user_id: context.userId,
      source_type: ex.source_type,
      source_id: ex.source_id,
      exercise_type: ex.exercise_type,
      prompt: ex.prompt,
      instructions: ex.instructions ?? null,
      options: ex.options ?? null,
      correct_answer: ex.correct_answer,
      acceptable_answers: ex.acceptable_answers ?? null,
      explanation_pt: ex.explanation_pt ?? null,
      translation_pt: ex.translation_pt ?? null,
      hint: ex.hint ?? null,
      display_order: idx,
    }));

    const { error: insErr } = await context.supabase.from("daily_training_items").insert(rows);
    if (insErr) throw new Error(insErr.message);

    const estMin = Math.max(3, Math.round(rows.length * 0.75));
    await context.supabase
      .from("daily_training_sessions")
      .update({ total_items: rows.length, estimated_minutes: estMin })
      .eq("id", sessionId);

    const { data: session } = await context.supabase
      .from("daily_training_sessions")
      .select("id, status, total_items, completed_items, correct_items, estimated_minutes, training_date, started_at, completed_at, created_at")
      .eq("id", sessionId)
      .single();
    const { data: items } = await context.supabase
      .from("daily_training_items")
      .select("*")
      .eq("session_id", sessionId)
      .order("display_order", { ascending: true });

    return { session, items: items ?? [] };
  });

export const getTrainingSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ sessionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: session } = await context.supabase
      .from("daily_training_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!session) throw new Error("Treino não encontrado.");
    const { data: items } = await context.supabase
      .from("daily_training_items")
      .select("*")
      .eq("session_id", data.sessionId)
      .order("display_order", { ascending: true });
    return { session, items: items ?? [] };
  });

export const submitTrainingAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        answer: z.string().min(1).max(1000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from("daily_training_items")
      .select("*")
      .eq("id", data.itemId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!item) throw new Error("Exercício não encontrado.");
    if (item.completed) return { verdict: "correct", feedback_pt: null, correct_answer: item.correct_answer, translation_pt: item.translation_pt, already: true };

    const attempts = (item.attempts ?? 0) + 1;

    // Determine verdict
    let verdict: "correct" | "close" | "wrong" = "wrong";
    let feedback: string | null = null;

    const needsAi =
      item.exercise_type === "translate" ||
      item.exercise_type === "open_response" ||
      item.exercise_type === "fix_error" ||
      item.exercise_type === "order_words";

    // Local validation first
    const local = localValidate(data.answer, item.correct_answer, item.acceptable_answers as string[] | null);
    if (local === "correct") verdict = "correct";
    else if (needsAi) {
      const judged = await aiJudgeOpen(item.prompt, item.correct_answer, data.answer, item.instructions ?? "Responda em inglês.");
      verdict = judged.verdict;
      feedback = judged.feedback_pt;
    } else {
      // multiple choice / natural_choice: local already returned correct/close/wrong
      verdict = local;
    }

    // Update item
    const isCorrect = verdict === "correct" || verdict === "close";
    const shouldComplete = isCorrect || attempts >= 2;
    const score = verdict === "correct" ? 1 : verdict === "close" ? 0.6 : 0;

    await context.supabase
      .from("daily_training_items")
      .update({
        user_answer: data.answer.slice(0, 1000),
        attempts,
        score: shouldComplete ? score : null,
        completed: shouldComplete,
        completed_at: shouldComplete ? new Date().toISOString() : null,
      })
      .eq("id", item.id);

    // Update learning_items mastery when we have a source
    if (shouldComplete && item.source_id && (item.source_type === "learning_error" || item.source_type === "vocabulary" || item.source_type === "phrase")) {
      const { data: li } = await context.supabase
        .from("learning_items")
        .select("mastery_level, correct_streak, incorrect_count, total_attempts")
        .eq("id", item.source_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (li) {
        const wasCorrect = verdict === "correct";
        const newStreak = wasCorrect ? (li.correct_streak ?? 0) + 1 : 0;
        let newLevel = li.mastery_level ?? 0;
        if (wasCorrect) newLevel = Math.min(4, newLevel + 1);
        else newLevel = Math.max(0, newLevel - 1);

        const daysAhead = newLevel <= 1 ? 1 : newLevel === 2 ? 2 : newLevel === 3 ? 4 : 7;
        const nextReview = new Date(Date.now() + daysAhead * 86400000).toISOString();

        await context.supabase
          .from("learning_items")
          .update({
            mastery_level: newLevel,
            correct_streak: newStreak,
            incorrect_count: (li.incorrect_count ?? 0) + (wasCorrect ? 0 : 1),
            total_attempts: (li.total_attempts ?? 0) + 1,
            times_practiced: (li.total_attempts ?? 0) + 1,
            last_practiced_at: new Date().toISOString(),
            next_review_at: nextReview,
            mastered_at: newLevel >= 4 ? new Date().toISOString() : null,
          })
          .eq("id", item.source_id);
      }
    }

    // Update session progress + started_at
    if (!item.completed && shouldComplete) {
      const { data: sess } = await context.supabase
        .from("daily_training_sessions")
        .select("id, completed_items, correct_items, total_items, status, started_at")
        .eq("id", item.session_id)
        .maybeSingle();
      if (sess) {
        const completedNext = (sess.completed_items ?? 0) + 1;
        const correctNext = (sess.correct_items ?? 0) + (verdict === "correct" ? 1 : 0);
        await context.supabase
          .from("daily_training_sessions")
          .update({
            completed_items: completedNext,
            correct_items: correctNext,
            status: sess.status === "ready" ? "in_progress" : sess.status,
            started_at: sess.started_at ?? new Date().toISOString(),
          })
          .eq("id", sess.id);
      }
    }

    return {
      verdict,
      feedback_pt: feedback,
      correct_answer: item.correct_answer,
      translation_pt: item.translation_pt,
      explanation_pt: item.explanation_pt,
      attempts,
      revealed: !isCorrect && attempts >= 2,
      completed: shouldComplete,
    };
  });

export const completeTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ sessionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: sess } = await context.supabase
      .from("daily_training_sessions")
      .select("id, status, total_items, correct_items, xp_earned")
      .eq("id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sess) throw new Error("Treino não encontrado.");
    if (sess.status === "completed") return { xp_earned: sess.xp_earned ?? 0, already: true };

    const xp = (sess.correct_items ?? 0) * 10 + (sess.correct_items === sess.total_items ? 20 : 0);
    await context.supabase
      .from("daily_training_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString(), xp_earned: xp })
      .eq("id", sess.id);

    // Update user_stats (xp + streak)
    const today = new Date().toISOString().slice(0, 10);
    const { data: stats } = await context.supabase
      .from("user_stats")
      .select("xp, streak_days, longest_streak, last_practice_date")
      .eq("user_id", context.userId)
      .maybeSingle();

    let streak = stats?.streak_days ?? 0;
    const last = stats?.last_practice_date ?? null;
    if (last === today) {
      // same day — keep
    } else if (last) {
      const diff = Math.round(
        (new Date(today + "T00:00:00Z").getTime() - new Date(last + "T00:00:00Z").getTime()) / 86400000,
      );
      streak = diff === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    const longest = Math.max(stats?.longest_streak ?? 0, streak);
    const newXp = (stats?.xp ?? 0) + xp;

    await context.supabase.from("user_stats").upsert(
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

    await context.supabase.from("practice_sessions").insert({
      user_id: context.userId,
      activity: "daily_training",
      items_total: sess.total_items,
      items_correct: sess.correct_items,
      xp_earned: xp,
    });

    return { xp_earned: xp, xp_total: newXp, streak_days: streak, longest_streak: longest };
  });

export const getTodayTrainingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await context.supabase
      .from("daily_training_sessions")
      .select("id, status, total_items, completed_items, correct_items, estimated_minutes, training_date")
      .eq("user_id", context.userId)
      .eq("training_date", today)
      .eq("is_extra", false)
      .maybeSingle();
    return data ?? null;
  });

export const listTrainingHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ limit: z.number().int().min(1).max(50).default(20) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("daily_training_sessions")
      .select("id, training_date, status, total_items, completed_items, correct_items, xp_earned, is_extra, created_at, completed_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });

export const getFocusPoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("learning_items")
      .select("id, kind, original, correction, explanation_pt, mastery_level, incorrect_count, total_attempts, last_practiced_at")
      .eq("user_id", context.userId)
      .eq("kind", "error")
      .eq("active", true)
      .order("incorrect_count", { ascending: false })
      .limit(5);
    return data ?? [];
  });

export const listMyVocabulary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(50), includeInactive: z.boolean().default(false) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("learning_items")
      .select("id, original, explanation_pt, mastery_level, times_practiced, last_practiced_at, mastered_at, active, created_at")
      .eq("user_id", context.userId)
      .eq("kind", "vocabulary")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (!data.includeInactive) q = q.eq("active", true);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const setVocabularyActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ itemId: z.string().uuid(), active: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("learning_items")
      .update({ active: data.active })
      .eq("id", data.itemId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markVocabularyMastered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ itemId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const nowIso = new Date().toISOString();
    const { error } = await context.supabase
      .from("learning_items")
      .update({ mastery_level: 4, mastered_at: nowIso, next_review_at: new Date(Date.now() + 14 * 86400000).toISOString() })
      .eq("id", data.itemId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
