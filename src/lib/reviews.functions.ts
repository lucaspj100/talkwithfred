import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createLovableGateway } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

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
  "reorder_sentence",
  "rewrite_sentence",
  "translate",
  "contextual_response",
  "vocabulary_review",
] as const;

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
    supabase
      .from("conversations")
      .select("id, title, mode, custom_topic, created_at")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);
  return { conv, msgs: (msgs ?? []) as { role: "user" | "assistant"; content: string; created_at: string }[] };
}

function hasEnoughContent(msgs: { role: string; content: string }[]): boolean {
  const userTurns = msgs.filter((m) => m.role === "user" && m.content.trim().length > 0);
  if (userTurns.length < 2) return false;
  const totalChars = userTurns.reduce((s, m) => s + m.content.length, 0);
  return totalChars >= 40;
}

// -------- Analysis (server-only) --------

type AnalysisResult = {
  title: string;
  summary: string;
  level_detected?: string | null;
  items: {
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
    exercise_type?: string | null;
  }[];
};

async function runAnalysis(
  transcript: { role: string; content: string }[],
  meta: { mode: string; topic: string | null; level: string | null },
): Promise<AnalysisResult> {
  const lines = transcript
    .map((m) => `${m.role === "user" ? "USUÁRIO" : "FRED"}: ${m.content}`)
    .join("\n");

  const prompt = `Você analisa uma conversa em inglês entre um estudante brasileiro e o tutor Fred.

Tema/modo da conversa: ${meta.mode}${meta.topic ? ` (${meta.topic})` : ""}.
Nível declarado do aluno: ${meta.level ?? "desconhecido"}.

TRANSCRIÇÃO:
"""
${lines}
"""

Analise APENAS as falas do USUÁRIO. As falas do FRED são o modelo correto.

Retorne JSON estrito com este formato, sem prosa:
{
  "title": "Título curto em português sobre o tema (máx 60 caracteres)",
  "summary": "Resumo em português com 1-2 frases (máx 200 caracteres) descrevendo sobre o que foi a conversa e quantos pontos serão revisados.",
  "level_detected": "beginner | basic | intermediate | advanced (opcional, só se tiver confiança)",
  "items": [
    {
      "type": "grammar_error | unnatural_phrase | vocabulary | word_choice | incomplete_answer | positive_feedback | general_improvement",
      "category": "curta em PT (ex: 'Present perfect', 'Preposição', 'Escolha de palavra')",
      "original_text": "trecho exato dito pelo usuário (obrigatório para itens de erro)",
      "corrected_text": "versão gramaticalmente correta em inglês",
      "natural_text": "versão mais natural em inglês (pode ser igual ao corrected)",
      "explanation_pt": "explicação curta e amigável em português brasileiro (máx 240 caracteres)",
      "translation_pt": "tradução em PT-BR da versão correta/natural",
      "context_text": "situação da conversa em PT (opcional)",
      "vocabulary": [{"word": "palavra", "explanation_pt": "significado em PT"}],
      "importance": "low | medium | high",
      "exercise_type": "multiple_choice | rewrite_sentence | translate | contextual_response | vocabulary_review"
    }
  ]
}

REGRAS RÍGIDAS:
- Máximo 5 itens. Selecione APENAS os mais úteis.
- Não invente erros: se a frase do usuário estiver correta e natural, não inclua como erro.
- Diferencie "incorreto" de "correto mas pouco natural" (use unnatural_phrase).
- Vocabulary: palavras/expressões úteis usadas pelo Fred que o aluno pode aprender.
- positive_feedback: opcional, no máximo 1 item, para reforço.
- Tom encorajador e positivo em PT-BR.
- Se o usuário praticamente não falou ou só disse coisas triviais ("hi", "ok"), retorne items: [].`;

  const { text } = await generateText({
    model: gateway()(MODEL),
    prompt,
    temperature: 0.3,
  });

  const parsed = safeJson<AnalysisResult>(text);
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error("Análise da IA retornou formato inválido");
  }
  parsed.items = parsed.items
    .filter((it) => it && REVIEW_TYPES.includes(it.type as ReviewType))
    .slice(0, 5)
    .map((it) => ({
      ...it,
      importance: (["low", "medium", "high"] as const).includes(it.importance as Importance)
        ? (it.importance as Importance)
        : "medium",
      exercise_type: it.exercise_type && (EXERCISE_TYPES as readonly string[]).includes(it.exercise_type)
        ? it.exercise_type
        : (it.type === "vocabulary" ? "vocabulary_review" : "multiple_choice"),
    }));
  return parsed;
}

// -------- Server Functions --------

/**
 * Idempotently create a review for a conversation.
 * If already exists, returns the existing row.
 * Fires analysis inline (small model). Frontend polls via getReviewByConversation.
 */
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

    if (existing) {
      // Idempotent: don't reprocess unless previous failed.
      if (existing.status === "failed" || existing.analysis_status === "failed") {
        // Reset for retry (handled by retryConversationReview).
      }
      return { id: existing.id, reused: true };
    }

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

    // Insert placeholder row.
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
      // Race condition: another concurrent call already inserted.
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

    // Run analysis inline. On failure, mark as failed.
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
        exercise_type: it.exercise_type ?? null,
        display_order: idx,
      }));

      const { error: itemsErr } = await supabase.from("conversation_review_items").insert(rows);
      if (itemsErr) throw new Error(itemsErr.message);

      const estimated = Math.max(2, Math.round(rows.length * 1.2));
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

    // Wipe stale items, reset status, rerun.
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
        exercise_type: it.exercise_type ?? null,
        display_order: idx,
      }));
      if (rows.length > 0) {
        await supabase.from("conversation_review_items").insert(rows);
      }
      await supabase
        .from("conversation_reviews")
        .update({
          status: rows.length === 0 ? "skipped" : "ready",
          analysis_status: "completed",
          title: (result.title || conv.title || "Revisão").slice(0, 120),
          summary: (result.summary || "").slice(0, 400),
          total_items: rows.length,
          estimated_minutes: Math.max(2, Math.round(rows.length * 1.2)),
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
      .select("id, title, status, total_items, completed_items, estimated_minutes, updated_at")
      .eq("user_id", context.userId)
      .in("status", ["ready", "in_progress"])
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
    const patch: Record<string, unknown> = { status: "in_progress" };
    if (!rev.started_at) patch.started_at = new Date().toISOString();
    await context.supabase.from("conversation_reviews").update(patch).eq("id", rev.id);
    return { ok: true };
  });

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
      .update({ completed: true, completed_at: new Date().toISOString(), user_answer: data.userAnswer ?? null })
      .eq("id", item.id);
    // Increment counter on parent review.
    const { data: countRow } = await context.supabase
      .from("conversation_review_items")
      .select("id", { count: "exact", head: true })
      .eq("review_id", item.review_id)
      .eq("user_id", context.userId)
      .eq("completed", true);
    await context.supabase
      .from("conversation_reviews")
      .update({ completed_items: (countRow as unknown as { count?: number } | null)?.count ?? undefined })
      .eq("id", item.review_id);
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
