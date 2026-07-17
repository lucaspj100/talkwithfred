import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============ Validation utils ============

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
    .replace(/[.,!?;:"()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  return dp[m][n];
}

function localValidate(userAnswer: string, correct: string, acceptable: string[] = []): "correct" | "close" | "wrong" {
  const u = normalize(userAnswer);
  if (!u) return "wrong";
  const cands = [correct, ...acceptable].map(normalize).filter(Boolean);
  if (cands.some((c) => c === u)) return "correct";
  const dist = Math.min(...cands.map((c) => levenshtein(c, u)));
  const shortest = Math.min(...cands.map((c) => c.length));
  if (dist <= Math.max(1, Math.floor(shortest * 0.12))) return "close";
  return "wrong";
}

// ============ Modes ============

export type FreeMode =
  | "fill_blank"
  | "choice"
  | "correct_error"
  | "my_errors"
  | "quick_challenge"
  | "infinite";

const MODE_TYPES: Record<FreeMode, string[]> = {
  fill_blank: ["fill_in_blank"],
  choice: ["multiple_choice", "vocabulary_choice", "contextual_choice", "choose_natural_phrase"],
  correct_error: ["correct_error"],
  my_errors: [],
  quick_challenge: ["fill_in_blank", "multiple_choice", "correct_error", "choose_natural_phrase", "vocabulary_choice"],
  infinite: ["fill_in_blank", "multiple_choice", "correct_error", "choose_natural_phrase", "vocabulary_choice", "reorder_sentence", "contextual_choice"],
};

const MODE_LIMIT: Record<FreeMode, number | null> = {
  fill_blank: null,
  choice: null,
  correct_error: null,
  my_errors: null,
  quick_challenge: 60,
  infinite: null,
};

// ============ Start session ============

export const startFreeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      mode: z.enum(["fill_blank", "choice", "correct_error", "my_errors", "quick_challenge", "infinite"]),
      topic: z.string().max(40).optional(),
      level: z.enum(["basic", "intermediate", "advanced"]).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("free_practice_sessions")
      .insert({
        user_id: context.userId,
        mode: data.mode,
        topic: data.topic ?? null,
        level: data.level ?? null,
        time_limit_seconds: MODE_LIMIT[data.mode as FreeMode],
      })
      .select("id, mode, topic, level, time_limit_seconds, started_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ============ Get next exercise ============

type Exercise = {
  source_type: "exercise_bank" | "learning_item";
  source_id: string;
  exercise_type: string;
  prompt: string;
  instructions: string | null;
  options: string[];
  correct_answer: string;
  acceptable_answers: string[];
  explanation_pt: string | null;
};

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const getNextFreeExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      sessionId: z.string().uuid(),
      excludeIds: z.array(z.string()).max(200).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }): Promise<Exercise | null> => {
    const { data: sess } = await context.supabase
      .from("free_practice_sessions")
      .select("id, mode, topic, level, user_id")
      .eq("id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sess) throw new Error("Sessão não encontrada.");

    const mode = sess.mode as FreeMode;
    const exclude = data.excludeIds ?? [];

    // "My errors" mode: pull from learning_items errors
    if (mode === "my_errors") {
      const { data: rows } = await context.supabase
        .from("learning_items")
        .select("id, original, correction, explanation_pt")
        .eq("user_id", context.userId)
        .eq("kind", "error")
        .not("correction", "is", null)
        .order("created_at", { ascending: false })
        .limit(40);
      const pool = (rows ?? []).filter((r) => !exclude.includes(r.id) && r.correction);
      if (pool.length === 0) return null;
      const pick = pool[Math.floor(Math.random() * pool.length)];

      // Build a fake "correct the error" MCQ: options = [correction, original, +2 distractors from pool]
      const distractors = shuffle(pool.filter((p) => p.id !== pick.id))
        .slice(0, 2)
        .map((p) => p.correction!)
        .filter((s) => s !== pick.correction);
      const opts = shuffle(Array.from(new Set([pick.correction!, pick.original, ...distractors]))).slice(0, 4);
      return {
        source_type: "learning_item",
        source_id: pick.id,
        exercise_type: "multiple_choice",
        prompt: `Qual é a forma correta em inglês para: "${pick.original}"?`,
        instructions: "Escolha a versão correta.",
        options: opts,
        correct_answer: pick.correction!,
        acceptable_answers: [pick.correction!],
        explanation_pt: pick.explanation_pt,
      };
    }

    // Bank-based modes
    const types = MODE_TYPES[mode];
    let q = context.supabase
      .from("practice_exercise_bank")
      .select("id, exercise_type, prompt, instructions, options, correct_answer, acceptable_answers, explanation_pt, level, topic")
      .eq("is_active", true)
      .in("exercise_type", types);
    if (sess.topic) q = q.eq("topic", sess.topic);
    if (sess.level) q = q.eq("level", sess.level);
    if (exclude.length > 0) q = q.not("id", "in", `(${exclude.map((x) => `"${x}"`).join(",")})`);

    const { data: rows } = await q.limit(50);
    let pool = rows ?? [];

    // Fallback: relax topic/level if empty
    if (pool.length === 0 && (sess.topic || sess.level)) {
      let q2 = context.supabase
        .from("practice_exercise_bank")
        .select("id, exercise_type, prompt, instructions, options, correct_answer, acceptable_answers, explanation_pt, level, topic")
        .eq("is_active", true)
        .in("exercise_type", types);
      if (exclude.length > 0) q2 = q2.not("id", "in", `(${exclude.map((x) => `"${x}"`).join(",")})`);
      const { data: rows2 } = await q2.limit(50);
      pool = rows2 ?? [];
    }
    if (pool.length === 0) return null;

    const pick = pool[Math.floor(Math.random() * pool.length)];
    const rawOpts = Array.isArray(pick.options) ? (pick.options as unknown[]) : [];
    const options = rawOpts.map(String);
    const isReorder = pick.exercise_type === "reorder_sentence";
    return {
      source_type: "exercise_bank",
      source_id: pick.id,
      exercise_type: pick.exercise_type,
      prompt: pick.prompt,
      instructions: pick.instructions,
      options: isReorder ? shuffle(options) : options,
      correct_answer: pick.correct_answer,
      acceptable_answers: (Array.isArray(pick.acceptable_answers) ? pick.acceptable_answers : []).map(String),
      explanation_pt: pick.explanation_pt,
    };
  });

// ============ Submit answer ============

export const submitFreeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      sessionId: z.string().uuid(),
      sourceType: z.enum(["exercise_bank", "learning_item"]),
      sourceId: z.string().uuid(),
      exerciseType: z.string().min(1).max(40),
      promptSnapshot: z.string().min(1).max(2000),
      correctSnapshot: z.string().min(1).max(2000),
      acceptable: z.array(z.string()).max(20).optional(),
      userAnswer: z.string().min(1).max(2000),
      responseTimeMs: z.number().int().min(0).max(600000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const verdict = localValidate(data.userAnswer, data.correctSnapshot, data.acceptable ?? []);
    const isCorrect = verdict === "correct";
    const xpEarned = isCorrect ? 3 : verdict === "close" ? 1 : 0;

    await context.supabase.from("free_practice_attempts").insert({
      session_id: data.sessionId,
      user_id: context.userId,
      source_type: data.sourceType,
      source_id: data.sourceId,
      exercise_type: data.exerciseType,
      prompt_snapshot: data.promptSnapshot,
      correct_snapshot: data.correctSnapshot,
      user_answer: data.userAnswer,
      correct: isCorrect,
      response_time_ms: data.responseTimeMs ?? null,
      used_ai_fallback: false,
    });

    // Update session counters + XP on user_stats
    const { data: sess } = await context.supabase
      .from("free_practice_sessions")
      .select("total_answered, correct_answers, incorrect_answers, xp_earned")
      .eq("id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (sess) {
      await context.supabase
        .from("free_practice_sessions")
        .update({
          total_answered: (sess.total_answered ?? 0) + 1,
          correct_answers: (sess.correct_answers ?? 0) + (isCorrect ? 1 : 0),
          incorrect_answers: (sess.incorrect_answers ?? 0) + (isCorrect ? 0 : 1),
          xp_earned: (sess.xp_earned ?? 0) + xpEarned,
        })
        .eq("id", data.sessionId);
    }

    // If tied to learning_item, update mastery / attempts
    if (data.sourceType === "learning_item") {
      const { data: li } = await context.supabase
        .from("learning_items")
        .select("total_attempts, correct_streak, incorrect_count, mastery_level")
        .eq("id", data.sourceId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (li) {
        const streak = isCorrect ? (li.correct_streak ?? 0) + 1 : 0;
        const mastery = Math.max(0, Math.min(4, (li.mastery_level ?? 0) + (isCorrect ? (streak >= 2 ? 1 : 0) : -1)));
        await context.supabase
          .from("learning_items")
          .update({
            total_attempts: (li.total_attempts ?? 0) + 1,
            correct_streak: streak,
            incorrect_count: (li.incorrect_count ?? 0) + (isCorrect ? 0 : 1),
            mastery_level: mastery,
            last_practiced_at: new Date().toISOString(),
          })
          .eq("id", data.sourceId);
      }
    }

    // Add XP to user_stats (lightweight)
    if (xpEarned > 0) {
      const { data: st } = await context.supabase
        .from("user_stats")
        .select("xp")
        .eq("user_id", context.userId)
        .maybeSingle();
      await context.supabase.from("user_stats").upsert(
        { user_id: context.userId, xp: (st?.xp ?? 0) + xpEarned, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    }

    return { verdict, xp_earned: xpEarned, correct: isCorrect };
  });

// ============ End session ============

export const endFreeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ sessionId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("free_practice_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("user_id", context.userId)
      .select("id, mode, total_answered, correct_answers, incorrect_answers, xp_earned, started_at, ended_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// ============ Available topics/levels for filters ============

export const getFreePracticeFilters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase
      .from("practice_exercise_bank")
      .select("topic, level")
      .eq("is_active", true);
    const topics = Array.from(new Set((rows ?? []).map((r) => r.topic))).sort();
    const levels = ["basic", "intermediate", "advanced"].filter((l) =>
      (rows ?? []).some((r) => r.level === l),
    );
    return { topics, levels };
  });
