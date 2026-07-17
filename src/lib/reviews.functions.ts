import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createLovableGateway } from "@/lib/ai-gateway.server";
import { generateText } from "ai";
import type { Database } from "@/integrations/supabase/types";

type ItemUpdate = Database["public"]["Tables"]["conversation_review_items"]["Update"];


const MODEL = "google/gemini-3-flash-preview";

const REVIEW_TYPES = [
  "grammar_error",
  "unnatural_phrase",
  "vocabulary",
  "word_choice",
  "incomplete_answer",
  "pronunciation_note",
  "positive_feedback",
  "general_improvement",
] as const;
type ReviewType = (typeof REVIEW_TYPES)[number];
type Importance = "low" | "medium" | "high";

const EXERCISE_TYPES = [
  "multiple_choice",
  "fill_blank",
  "rewrite_sentence",
  "translate",
  "reorder_sentence",
  "listen_repeat",
  "vocabulary_match",
] as const;
type ExerciseType = (typeof EXERCISE_TYPES)[number];

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

// -------- Helpers --------

async function fetchConversationContext(
  supabase: ReturnType<typeof requireSupabaseAuth extends never ? never : any>,
  userId: string,
  conversationId: string,
) {
  const [{ data: conv }, { data: msgs }] = await Promise.all([
    supabase.from("conversations").select("id, title, mode, custom_topic, created_at").eq("id", conversationId).eq("user_id", userId).maybeSingle(),
    supabase.from("messages").select("role, content, created_at").eq("conversation_id", conversationId).eq("user_id", userId).order("created_at", { ascending: true }).limit(200),
  ]);
  return { conv, msgs: (msgs ?? []) as { role: "user" | "assistant"; content: string; created_at: string }[] };
}

function hasEnoughContent(msgs: { role: string; content: string }[]): boolean {
  const userTurns = msgs.filter((m) => m.role === "user" && m.content.trim().length > 0);
  if (userTurns.length < 2) return false;
  const totalChars = userTurns.reduce((s, m) => s + m.content.length, 0);
  return totalChars >= 40;
}

// -------- Analysis --------

type ExerciseSpec = {
  type: ExerciseType;
  prompt: string;
  instructions?: string | null;
  options?: string[] | null;
  correct_answer: string;
  acceptable_answers?: string[];
};

type AnalysisItem = {
  type: ReviewType;
  category?: string | null;
  original_text?: string | null;
  corrected_text?: string | null;
  natural_text?: string | null;
  explanation_pt: string;
  translation_pt?: string | null;
  context_text?: string | null;
  vocabulary?: { word: string; explanation_pt?: string }[];
  importance?: Importance;
  exercise?: ExerciseSpec | null;
  second_exercise?: ExerciseSpec | null;
};
type AnalysisResult = {
  title: string;
  summary: string;
  level_detected?: string | null;
  items: AnalysisItem[];
};

const ANALYSIS_PROMPT_TEMPLATE = (transcript: string, meta: { mode: string; topic: string | null; level: string | null }) => `Você analisa uma conversa em inglês entre um estudante brasileiro e o tutor Fred.

Tema/modo: ${meta.mode}${meta.topic ? ` (${meta.topic})` : ""}. Nível: ${meta.level ?? "desconhecido"}.

TRANSCRIÇÃO:
"""
${transcript}
"""

Analise APENAS as falas do USUÁRIO. Selecione até 5 pontos MAIS ÚTEIS (erros reais ou frases pouco naturais). Para CADA ponto, crie DOIS exercícios interativos personalizados baseados no erro real do usuário.

Retorne JSON estrito, sem prosa:
{
  "title": "Título curto em PT (máx 60 chars)",
  "summary": "Resumo em PT (máx 200 chars)",
  "level_detected": "beginner|basic|intermediate|advanced (opcional)",
  "items": [
    {
      "type": "grammar_error|unnatural_phrase|vocabulary|word_choice|incomplete_answer|positive_feedback|general_improvement",
      "category": "curta em PT (ex: 'Preposição', 'Past simple')",
      "original_text": "trecho exato dito pelo usuário",
      "corrected_text": "versão correta em inglês",
      "natural_text": "versão mais natural em inglês",
      "explanation_pt": "explicação curta e amigável em PT-BR (máx 240 chars)",
      "translation_pt": "tradução em PT-BR da versão correta",
      "context_text": "opcional",
      "importance": "low|medium|high",
      "exercise": {
        "type": "multiple_choice|fill_blank|rewrite_sentence|translate|reorder_sentence|vocabulary_match",
        "prompt": "Frase do exercício em inglês (use ___ para lacuna quando fill_blank)",
        "instructions": "Instrução curta em PT (ex: 'Complete a frase', 'Escolha a mais natural')",
        "options": ["opção A", "opção B", "opção C"],
        "correct_answer": "resposta correta exata",
        "acceptable_answers": ["variações aceitas"]
      },
      "second_exercise": {
        "type": "translate|rewrite_sentence|fill_blank|multiple_choice",
        "prompt": "NOVO contexto aplicando a mesma regra (ex: para tradução, frase em PT)",
        "instructions": "Instrução em PT",
        "options": null,
        "correct_answer": "resposta principal correta em inglês",
        "acceptable_answers": ["outras formas naturais aceitas, incluindo contrações"]
      }
    }
  ]
}

REGRAS:
- Cada exercício DEVE ser baseado no erro real e na regra específica desse ponto.
- Para GRAMMAR_ERROR: use fill_blank ou multiple_choice para o primeiro; translate ou rewrite para o segundo.
- Para UNNATURAL_PHRASE: use multiple_choice (escolher a mais natural) no primeiro; rewrite ou translate no segundo.
- Para WORD_CHOICE: use multiple_choice ou fill_blank em ambos.
- Para VOCABULARY: use vocabulary_match ou fill_blank no primeiro; translate no segundo.
- Para INCOMPLETE_ANSWER: primeiro exercício expandir a resposta (rewrite_sentence com instrução para adicionar detalhes); segundo, rewrite com contexto novo.
- Para POSITIVE_FEEDBACK: exercícios são desafio leve aplicando a mesma estrutura.
- multiple_choice DEVE ter 3-4 options e correct_answer DEVE estar entre elas exatamente igual.
- acceptable_answers para tradução SEMPRE inclua contrações naturais (I'd/I would, don't/do not) quando aplicável.
- NUNCA use exercícios genéricos — devem se conectar ao contexto da conversa.
- Não invente erros. Máx 5 itens.`;

async function runAnalysis(
  transcript: { role: string; content: string }[],
  meta: { mode: string; topic: string | null; level: string | null },
): Promise<AnalysisResult> {
  const lines = transcript.map((m) => `${m.role === "user" ? "USUÁRIO" : "FRED"}: ${m.content}`).join("\n");
  const { text } = await generateText({
    model: gateway()(MODEL),
    prompt: ANALYSIS_PROMPT_TEMPLATE(lines, meta),
    temperature: 0.3,
  });
  const parsed = safeJson<AnalysisResult>(text);
  if (!parsed || !Array.isArray(parsed.items)) throw new Error("Análise da IA retornou formato inválido");
  parsed.items = parsed.items
    .filter((it) => it && REVIEW_TYPES.includes(it.type as ReviewType))
    .slice(0, 5)
    .map((it) => ({
      ...it,
      importance: (["low", "medium", "high"] as const).includes(it.importance as Importance) ? (it.importance as Importance) : "medium",
      exercise: sanitizeExercise(it.exercise),
      second_exercise: sanitizeExercise(it.second_exercise),
    }));
  return parsed;
}

function sanitizeExercise(ex: ExerciseSpec | null | undefined): ExerciseSpec | null {
  if (!ex || !ex.correct_answer || !ex.prompt) return null;
  const type = (EXERCISE_TYPES as readonly string[]).includes(ex.type) ? (ex.type as ExerciseType) : "multiple_choice";
  const opts = Array.isArray(ex.options) ? ex.options.filter((o) => typeof o === "string") : null;
  return {
    type,
    prompt: String(ex.prompt).slice(0, 500),
    instructions: ex.instructions ? String(ex.instructions).slice(0, 300) : null,
    options: opts && opts.length > 0 ? opts.slice(0, 6) : null,
    correct_answer: String(ex.correct_answer).slice(0, 300),
    acceptable_answers: Array.isArray(ex.acceptable_answers) ? ex.acceptable_answers.map((a) => String(a).slice(0, 300)).slice(0, 10) : [],
  };
}

// -------- Exercise generation for legacy items --------

async function generateExercisesForLegacyItem(item: {
  type: string;
  original_text: string | null;
  corrected_text: string | null;
  natural_text: string | null;
  explanation_pt: string | null;
  category: string | null;
}): Promise<{ first: ExerciseSpec | null; second: ExerciseSpec | null }> {
  const prompt = `Você gera dois exercícios interativos personalizados a partir de um erro real de um aluno de inglês brasileiro.

DADOS DO ERRO:
- Tipo: ${item.type}
- Categoria: ${item.category ?? "-"}
- Frase original do aluno: ${item.original_text ?? "-"}
- Versão correta/natural: ${item.natural_text ?? item.corrected_text ?? "-"}
- Explicação: ${item.explanation_pt ?? "-"}

Retorne APENAS JSON estrito:
{
  "exercise": { "type": "multiple_choice|fill_blank|rewrite_sentence|translate|reorder_sentence|vocabulary_match", "prompt": "...", "instructions": "PT curto", "options": ["a","b","c"] ou null, "correct_answer": "...", "acceptable_answers": ["..."] },
  "second_exercise": { "type": "translate|rewrite_sentence|fill_blank|multiple_choice", "prompt": "novo contexto", "instructions": "PT", "options": null, "correct_answer": "...", "acceptable_answers": ["..."] }
}

REGRAS:
- Cada exercício deve testar a MESMA regra do erro em contexto NOVO.
- multiple_choice DEVE ter 3-4 options e correct_answer entre elas.
- acceptable_answers para tradução DEVE incluir contrações naturais.
- Nada genérico.`;
  const { text } = await generateText({
    model: gateway()(MODEL),
    prompt,
    temperature: 0.3,
  });
  const parsed = safeJson<{ exercise?: ExerciseSpec; second_exercise?: ExerciseSpec }>(text);
  return {
    first: sanitizeExercise(parsed?.exercise),
    second: sanitizeExercise(parsed?.second_exercise),
  };
}

// -------- Answer validation --------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:"'`´]/g, "")
    .replace(/\s+/g, " ")
    // Common contractions expand for comparison
    .replace(/\bi'd\b/g, "i would")
    .replace(/\bi'll\b/g, "i will")
    .replace(/\bi'm\b/g, "i am")
    .replace(/\bi've\b/g, "i have")
    .replace(/\bdon't\b/g, "do not")
    .replace(/\bdoesn't\b/g, "does not")
    .replace(/\bdidn't\b/g, "did not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bwouldn't\b/g, "would not")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bit's\b/g, "it is")
    .replace(/\bthat's\b/g, "that is")
    .replace(/\bwhat's\b/g, "what is")
    .replace(/\bhe's\b/g, "he is")
    .replace(/\bshe's\b/g, "she is")
    .replace(/\byou're\b/g, "you are")
    .replace(/\bthey're\b/g, "they are")
    .replace(/\bwe're\b/g, "we are")
    .replace(/\bisn't\b/g, "is not")
    .replace(/\baren't\b/g, "are not")
    .replace(/\bwasn't\b/g, "was not")
    .replace(/\bweren't\b/g, "were not");
}

function localValidate(userAnswer: string, correct: string, acceptable: string[]): "correct" | "close" | "wrong" {
  const n = normalize(userAnswer);
  if (!n) return "wrong";
  const targets = [correct, ...(acceptable ?? [])].filter(Boolean).map(normalize);
  if (targets.includes(n)) return "correct";
  // close = same words, minor variation, or edit distance <= 3 for short answers
  for (const t of targets) {
    if (levenshtein(n, t) <= Math.max(2, Math.floor(t.length * 0.15))) return "close";
  }
  return "wrong";
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

async function aiJudge(userAnswer: string, correct: string, contextPrompt: string, instructions: string | null): Promise<{ verdict: "correct" | "close" | "wrong"; feedback_pt: string }> {
  const prompt = `Um aluno brasileiro respondeu a um exercício de inglês. Avalie se a resposta é aceitável.

Exercício: ${contextPrompt}
Instrução: ${instructions ?? "-"}
Resposta esperada: ${correct}
Resposta do aluno: ${userAnswer}

Retorne APENAS JSON: {"verdict": "correct|close|wrong", "feedback_pt": "feedback curto em PT-BR, no máx 160 chars, começando pelo ponto forte se houver"}

Considere "correct" se semanticamente equivalente (contrações, sinônimos comuns, ordem levemente diferente).
Considere "close" se quase certo com um pequeno erro (concordância, artigo, preposição).
Considere "wrong" se estruturalmente diferente ou incorreto.`;
  try {
    const { text } = await generateText({ model: gateway()(MODEL), prompt, temperature: 0.1 });
    const parsed = safeJson<{ verdict: string; feedback_pt: string }>(text);
    const v = parsed?.verdict;
    if (v === "correct" || v === "close" || v === "wrong") {
      return { verdict: v, feedback_pt: parsed?.feedback_pt?.slice(0, 200) ?? "" };
    }
  } catch (e) {
    console.error("[aiJudge]", e);
  }
  return { verdict: "wrong", feedback_pt: "Compare com a resposta esperada e tente novamente." };
}

// -------- Server Functions --------

export const startConversationReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const userId = context.userId;

    const { data: existing } = await supabase
      .from("conversation_reviews")
      .select("id, status, analysis_status")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) return { id: existing.id, reused: true };

    const { conv, msgs } = await fetchConversationContext(supabase, userId, data.conversationId);
    if (!conv) throw new Error("Conversa não encontrada");

    if (!hasEnoughContent(msgs)) {
      const { data: skipped, error } = await supabase
        .from("conversation_reviews")
        .insert({
          user_id: userId,
          conversation_id: data.conversationId,
          status: "skipped",
          analysis_status: "completed",
          title: conv.title ?? "Conversa curta",
          summary: "Essa conversa foi curta demais para gerar uma revisão personalizada.",
          total_items: 0,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: skipped.id, reused: false, skipped: true };
    }

    const { data: row, error: insErr } = await supabase
      .from("conversation_reviews")
      .insert({
        user_id: userId,
        conversation_id: data.conversationId,
        status: "processing",
        analysis_status: "processing",
        title: conv.title ?? "Nova revisão",
        summary: "Fred está preparando sua revisão…",
      })
      .select("id")
      .single();
    if (insErr) {
      const { data: again } = await supabase
        .from("conversation_reviews")
        .select("id")
        .eq("conversation_id", data.conversationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (again) return { id: again.id, reused: true };
      throw new Error(insErr.message);
    }
    const reviewId = row.id as string;

    try {
      const level = await supabase
        .from("user_profiles")
        .select("english_level")
        .eq("user_id", userId)
        .maybeSingle();

      const result = await runAnalysis(msgs, {
        mode: String(conv.mode),
        topic: conv.custom_topic ?? null,
        level: level.data?.english_level ?? null,
      });

      if (result.items.length === 0) {
        await supabase
          .from("conversation_reviews")
          .update({
            status: "skipped",
            analysis_status: "completed",
            title: result.title || conv.title || "Conversa",
            summary: result.summary || "Essa conversa foi curta demais para gerar uma revisão personalizada.",
            total_items: 0,
          })
          .eq("id", reviewId);
        return { id: reviewId, reused: false, skipped: true };
      }

      const rows = result.items.map((it, idx) => ({
        review_id: reviewId,
        user_id: userId,
        conversation_id: data.conversationId,
        type: it.type,
        category: it.category ?? null,
        original_text: it.original_text ?? null,
        corrected_text: it.corrected_text ?? null,
        natural_text: it.natural_text ?? it.corrected_text ?? null,
        explanation_pt: it.explanation_pt,
        translation_pt: it.translation_pt ?? null,
        context_text: it.context_text ?? null,
        vocabulary: it.vocabulary ?? [],
        importance: it.importance ?? "medium",
        display_order: idx,
        exercise_type: it.exercise?.type ?? null,
        exercise_prompt: it.exercise?.prompt ?? null,
        exercise_instructions: it.exercise?.instructions ?? null,
        exercise_options: it.exercise?.options ?? null,
        correct_answer: it.exercise?.correct_answer ?? null,
        acceptable_answers: it.exercise?.acceptable_answers ?? [],
        second_exercise_type: it.second_exercise?.type ?? null,
        second_exercise_prompt: it.second_exercise?.prompt ?? null,
        second_exercise_options: it.second_exercise?.options ?? null,
        second_correct_answer: it.second_exercise?.correct_answer ?? null,
        second_acceptable_answers: it.second_exercise?.acceptable_answers ?? [],
        exercise_generated_at: it.exercise ? new Date().toISOString() : null,
      }));

      const { error: itemsErr } = await supabase.from("conversation_review_items").insert(rows);
      if (itemsErr) throw new Error(itemsErr.message);

      const estimated = Math.max(3, Math.round(rows.length * 2));
      await supabase
        .from("conversation_reviews")
        .update({
          status: "ready",
          analysis_status: "completed",
          title: (result.title || conv.title || "Revisão").slice(0, 120),
          summary: (result.summary || "").slice(0, 400),
          level_detected: result.level_detected ?? null,
          total_items: rows.length,
          estimated_minutes: estimated,
        })
        .eq("id", reviewId);

      return { id: reviewId, reused: false, ready: true };
    } catch (err) {
      console.error("[startConversationReview] analysis error", err);
      await supabase
        .from("conversation_reviews")
        .update({
          status: "failed",
          analysis_status: "failed",
          analysis_error: (err as Error)?.message?.slice(0, 300) ?? "unknown",
        })
        .eq("id", reviewId);
      return { id: reviewId, reused: false, failed: true };
    }
  });

export const retryConversationReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ reviewId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rev } = await supabase
      .from("conversation_reviews")
      .select("id, conversation_id, status")
      .eq("id", data.reviewId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!rev) throw new Error("Revisão não encontrada");
    if (rev.status !== "failed") return { id: rev.id, ok: true };

    await supabase.from("conversation_review_items").delete().eq("review_id", rev.id).eq("user_id", userId);
    await supabase
      .from("conversation_reviews")
      .update({ status: "processing", analysis_status: "processing", analysis_error: null, total_items: 0, completed_items: 0 })
      .eq("id", rev.id);

    const { conv, msgs } = await fetchConversationContext(supabase, userId, rev.conversation_id);
    if (!conv) throw new Error("Conversa não encontrada");
    if (!hasEnoughContent(msgs)) {
      await supabase
        .from("conversation_reviews")
        .update({ status: "skipped", analysis_status: "completed", summary: "Essa conversa foi curta demais para gerar uma revisão personalizada." })
        .eq("id", rev.id);
      return { id: rev.id, ok: true, skipped: true };
    }
    try {
      const result = await runAnalysis(msgs, {
        mode: String(conv.mode),
        topic: conv.custom_topic ?? null,
        level: null,
      });
      const rows = result.items.map((it, idx) => ({
        review_id: rev.id,
        user_id: userId,
        conversation_id: rev.conversation_id,
        type: it.type,
        category: it.category ?? null,
        original_text: it.original_text ?? null,
        corrected_text: it.corrected_text ?? null,
        natural_text: it.natural_text ?? it.corrected_text ?? null,
        explanation_pt: it.explanation_pt,
        translation_pt: it.translation_pt ?? null,
        context_text: it.context_text ?? null,
        vocabulary: it.vocabulary ?? [],
        importance: it.importance ?? "medium",
        display_order: idx,
        exercise_type: it.exercise?.type ?? null,
        exercise_prompt: it.exercise?.prompt ?? null,
        exercise_instructions: it.exercise?.instructions ?? null,
        exercise_options: it.exercise?.options ?? null,
        correct_answer: it.exercise?.correct_answer ?? null,
        acceptable_answers: it.exercise?.acceptable_answers ?? [],
        second_exercise_type: it.second_exercise?.type ?? null,
        second_exercise_prompt: it.second_exercise?.prompt ?? null,
        second_exercise_options: it.second_exercise?.options ?? null,
        second_correct_answer: it.second_exercise?.correct_answer ?? null,
        second_acceptable_answers: it.second_exercise?.acceptable_answers ?? [],
        exercise_generated_at: it.exercise ? new Date().toISOString() : null,
      }));
      if (rows.length > 0) await supabase.from("conversation_review_items").insert(rows);
      await supabase
        .from("conversation_reviews")
        .update({
          status: rows.length === 0 ? "skipped" : "ready",
          analysis_status: "completed",
          title: (result.title || conv.title || "Revisão").slice(0, 120),
          summary: (result.summary || "").slice(0, 400),
          total_items: rows.length,
          estimated_minutes: Math.max(3, Math.round(rows.length * 2)),
        })
        .eq("id", rev.id);
      return { id: rev.id, ok: true };
    } catch (err) {
      await supabase
        .from("conversation_reviews")
        .update({ status: "failed", analysis_status: "failed", analysis_error: (err as Error)?.message?.slice(0, 300) ?? "unknown" })
        .eq("id", rev.id);
      throw err;
    }
  });

export const getReviewByConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rev } = await context.supabase
      .from("conversation_reviews")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!rev) return { review: null, items: [] };
    const { data: items } = await context.supabase
      .from("conversation_review_items")
      .select("*")
      .eq("review_id", rev.id)
      .eq("user_id", context.userId)
      .order("display_order", { ascending: true });
    return { review: rev, items: items ?? [] };
  });

export const getReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ reviewId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rev } = await context.supabase
      .from("conversation_reviews")
      .select("*")
      .eq("id", data.reviewId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!rev) throw new Error("Revisão não encontrada");
    const { data: items } = await context.supabase
      .from("conversation_review_items")
      .select("*")
      .eq("review_id", rev.id)
      .eq("user_id", context.userId)
      .order("display_order", { ascending: true });
    return { review: rev, items: items ?? [] };
  });

export const listMyReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversation_reviews")
      .select("id, conversation_id, status, title, summary, total_items, completed_items, estimated_minutes, created_at, updated_at, completed_at, started_at")
      .eq("user_id", context.userId)
      .in("status", ["ready", "in_progress", "completed", "processing", "failed"])
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getPendingReviewsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("conversation_reviews")
      .select("id, conversation_id, title, status, total_items, completed_items, estimated_minutes, updated_at")
      .eq("user_id", context.userId)
      .in("status", ["ready", "in_progress", "processing", "failed"])
      .order("updated_at", { ascending: false })
      .limit(5);
    const rows = data ?? [];
    return { count: rows.length, latest: rows[0] ?? null };
  });

export const beginReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ reviewId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rev } = await context.supabase
      .from("conversation_reviews")
      .select("id, status, started_at")
      .eq("id", data.reviewId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!rev) throw new Error("Revisão não encontrada");
    if (rev.status === "completed") return { ok: true };
    const startedAt = rev.started_at ?? new Date().toISOString();
    await context.supabase
      .from("conversation_reviews")
      .update({ status: "in_progress", started_at: startedAt })
      .eq("id", rev.id);
    return { ok: true };
  });

/** Ensures a review item has exercises (generates on-demand for legacy items). */
export const ensureItemExercises = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ itemId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from("conversation_review_items")
      .select("*")
      .eq("id", data.itemId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!item) throw new Error("Item não encontrado");
    if (item.exercise_prompt && item.correct_answer) return { item };

    try {
      const { first, second } = await generateExercisesForLegacyItem({
        type: item.type,
        original_text: item.original_text,
        corrected_text: item.corrected_text,
        natural_text: item.natural_text,
        explanation_pt: item.explanation_pt,
        category: item.category,
      });
      const patch: ItemUpdate = {
        exercise_generated_at: new Date().toISOString(),
      };
      if (first) {
        patch.exercise_type = first.type;
        patch.exercise_prompt = first.prompt;
        patch.exercise_instructions = first.instructions ?? null;
        patch.exercise_options = (first.options ?? null) as ItemUpdate["exercise_options"];
        patch.correct_answer = first.correct_answer;
        patch.acceptable_answers = (first.acceptable_answers ?? []) as ItemUpdate["acceptable_answers"];
      }
      if (second) {
        patch.second_exercise_type = second.type;
        patch.second_exercise_prompt = second.prompt;
        patch.second_exercise_options = (second.options ?? null) as ItemUpdate["second_exercise_options"];
        patch.second_correct_answer = second.correct_answer;
        patch.second_acceptable_answers = (second.acceptable_answers ?? []) as ItemUpdate["second_acceptable_answers"];
      }

      const { data: updated } = await context.supabase
        .from("conversation_review_items")
        .update(patch)
        .eq("id", item.id)
        .select("*")
        .single();
      return { item: updated };
    } catch (e) {
      console.error("[ensureItemExercises]", e);
      throw new Error("Não conseguimos gerar o exercício agora. Tente de novo.");
    }
  });

/** Submits an answer for stage 1 (practice) or stage 2 (apply). Returns verdict. */
export const submitExerciseAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        stage: z.enum(["practice", "apply"]),
        userAnswer: z.string().min(1).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from("conversation_review_items")
      .select("*")
      .eq("id", data.itemId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!item) throw new Error("Item não encontrado");

    const isPractice = data.stage === "practice";
    const correct = (isPractice ? item.correct_answer : item.second_correct_answer) as string | null;
    const acceptable = ((isPractice ? item.acceptable_answers : item.second_acceptable_answers) ?? []) as string[];
    const options = (isPractice ? item.exercise_options : item.second_exercise_options) as string[] | null;
    const type = (isPractice ? item.exercise_type : item.second_exercise_type) as string | null;
    const promptText = (isPractice ? item.exercise_prompt : item.second_exercise_prompt) as string | null;
    const instructions = item.exercise_instructions as string | null;

    if (!correct) throw new Error("Exercício sem resposta esperada");

    // Local validation
    let verdict = localValidate(data.userAnswer, correct, acceptable);
    let feedback: string | null = null;

    // If multiple_choice or fill_blank with options: strict local check only
    const isChoice = type === "multiple_choice" || (options && options.length > 0);
    if (!isChoice && verdict !== "correct") {
      // Fall back to AI judge for open-ended
      const ai = await aiJudge(data.userAnswer, correct, promptText ?? "", instructions);
      verdict = ai.verdict;
      feedback = ai.feedback_pt || null;
    }

    // Persist attempt
    const attemptsField = isPractice ? "attempts_first" : "attempts_second";
    const answerField = isPractice ? "user_answer_first" : "user_answer_second";
    const currentAttempts = ((isPractice ? item.attempts_first : item.attempts_second) ?? 0) as number;
    const newAttempts = currentAttempts + 1;

    await context.supabase
      .from("conversation_review_items")
      .update({
        [attemptsField]: newAttempts,
        [answerField]: data.userAnswer.slice(0, 500),
      })
      .eq("id", item.id);

    return {
      verdict,
      feedback_pt: feedback,
      correct_answer: correct,
      attempts: newAttempts,
    };
  });

/** Advances an item to the next stage or marks it completed. */
export const advanceItemStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ itemId: z.string().uuid(), toStage: z.enum(["practice", "apply", "done"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from("conversation_review_items")
      .select("id, review_id, stage, completed, attempts_first, attempts_second")
      .eq("id", data.itemId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!item) throw new Error("Item não encontrado");

    const patch: Record<string, unknown> = { stage: data.toStage };
    if (data.toStage === "done") {
      patch.completed = true;
      patch.completed_at = new Date().toISOString();
      // Score: correct on first try = 1, second try = 0.6, otherwise 0.3
      const attempts = ((item.attempts_first ?? 0) + (item.attempts_second ?? 0)) as number;
      patch.score = attempts <= 2 ? 1 : attempts <= 4 ? 0.6 : 0.3;
    }
    await context.supabase
      .from("conversation_review_items")
      .update(patch)
      .eq("id", item.id);

    // Recount completed
    if (data.toStage === "done") {
      const { count } = await context.supabase
        .from("conversation_review_items")
        .select("id", { count: "exact", head: true })
        .eq("review_id", item.review_id)
        .eq("user_id", context.userId)
        .eq("completed", true);
      await context.supabase
        .from("conversation_reviews")
        .update({ completed_items: count ?? undefined })
        .eq("id", item.review_id);
    }
    return { ok: true };
  });

export const completeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ reviewId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rev } = await context.supabase
      .from("conversation_reviews")
      .select("id, total_items")
      .eq("id", data.reviewId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!rev) throw new Error("Revisão não encontrada");
    await context.supabase
      .from("conversation_reviews")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_items: rev.total_items,
      })
      .eq("id", rev.id);
    return { ok: true };
  });

// Kept for backwards compat; now a thin wrapper.
export const completeReviewItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ itemId: z.string().uuid(), userAnswer: z.string().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from("conversation_review_items")
      .select("id, review_id, completed")
      .eq("id", data.itemId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!item) throw new Error("Item não encontrado");
    if (item.completed) return { ok: true };
    await context.supabase
      .from("conversation_review_items")
      .update({ completed: true, stage: "done", completed_at: new Date().toISOString(), user_answer: data.userAnswer ?? null })
      .eq("id", item.id);
    const { count } = await context.supabase
      .from("conversation_review_items")
      .select("id", { count: "exact", head: true })
      .eq("review_id", item.review_id)
      .eq("user_id", context.userId)
      .eq("completed", true);
    await context.supabase
      .from("conversation_reviews")
      .update({ completed_items: count ?? undefined })
      .eq("id", item.review_id);
    return { ok: true };
  });
