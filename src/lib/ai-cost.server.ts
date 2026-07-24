// Server-only. Calculates OpenAI cost from a Realtime `response.usage` object,
// records an event in ai_usage_events, and rolls up totals into usage_sessions.
// Never trust cost values from the client; only tokens are read from the payload.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RealtimeUsagePayload = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
    cached_tokens?: number;
    cached_tokens_details?: {
      text_tokens?: number;
      audio_tokens?: number;
    };
  };
  output_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
  };
};

export type ParsedTokens = {
  input_text_tokens: number;
  cached_input_text_tokens: number;
  output_text_tokens: number;
  input_audio_tokens: number;
  cached_input_audio_tokens: number;
  output_audio_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
};

function nz(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n ?? 0);
  return Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 10_000_000) : 0;
}

/** Tolerant parser. Cached tokens are subtracted from the non-cached buckets. */
export function parseRealtimeUsage(usage: RealtimeUsagePayload): ParsedTokens {
  const inDet = usage.input_token_details ?? {};
  const outDet = usage.output_token_details ?? {};
  const cachedDet = inDet.cached_tokens_details ?? {};

  const inTextTotal = nz(inDet.text_tokens);
  const inAudioTotal = nz(inDet.audio_tokens);
  const cachedText = Math.min(nz(cachedDet.text_tokens), inTextTotal);
  const cachedAudio = Math.min(nz(cachedDet.audio_tokens), inAudioTotal);

  return {
    input_text_tokens: Math.max(0, inTextTotal - cachedText),
    cached_input_text_tokens: cachedText,
    output_text_tokens: nz(outDet.text_tokens),
    input_audio_tokens: Math.max(0, inAudioTotal - cachedAudio),
    cached_input_audio_tokens: cachedAudio,
    output_audio_tokens: nz(outDet.audio_tokens),
    total_input_tokens: nz(usage.input_tokens),
    total_output_tokens: nz(usage.output_tokens),
  };
}

async function fetchPricing(model: string, at: Date) {
  const iso = at.toISOString();
  // Most-recent effective pricing at `at`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin as any)
    .from("ai_model_pricing")
    .select("*")
    .eq("model", model)
    .lte("effective_from", iso)
    .or(`effective_until.is.null,effective_until.gt.${iso}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as null | {
    input_text_per_million_usd: number;
    cached_input_text_per_million_usd: number;
    output_text_per_million_usd: number;
    input_audio_per_million_usd: number;
    cached_input_audio_per_million_usd: number;
    output_audio_per_million_usd: number;
  };
}

export function computeCostUsd(t: ParsedTokens, p: {
  input_text_per_million_usd: number;
  cached_input_text_per_million_usd: number;
  output_text_per_million_usd: number;
  input_audio_per_million_usd: number;
  cached_input_audio_per_million_usd: number;
  output_audio_per_million_usd: number;
}): number {
  const M = 1_000_000;
  return (
    (t.input_text_tokens * Number(p.input_text_per_million_usd)) / M +
    (t.cached_input_text_tokens * Number(p.cached_input_text_per_million_usd)) / M +
    (t.output_text_tokens * Number(p.output_text_per_million_usd)) / M +
    (t.input_audio_tokens * Number(p.input_audio_per_million_usd)) / M +
    (t.cached_input_audio_tokens * Number(p.cached_input_audio_per_million_usd)) / M +
    (t.output_audio_tokens * Number(p.output_audio_per_million_usd)) / M
  );
}

async function fetchExchangeRate(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin as any)
    .from("finance_settings")
    .select("usd_brl_rate")
    .eq("id", 1)
    .maybeSingle();
  const v = Number(data?.usd_brl_rate);
  return Number.isFinite(v) && v > 0 ? v : 5.2;
}

export type RecordArgs = {
  userId: string;
  usageSessionId?: string | null;
  conversationId?: string | null;
  providerResponseId?: string | null;
  providerEventId?: string | null;
  reportedModel?: string | null;
  serverModel: string;          // model the backend actually configured
  eventType: string;            // e.g. "response.done"
  usage: RealtimeUsagePayload;
};

export type RecordResult =
  | { ok: true; duplicate?: boolean; cost_usd: number; cost_brl: number; tokens: ParsedTokens; model: string }
  | { ok: false; code: string; message: string };

export async function recordAiUsageEvent(args: RecordArgs): Promise<RecordResult> {
  const tokens = parseRealtimeUsage(args.usage);

  // Validate session ownership when provided (defence-in-depth; RLS is already off for admin client)
  if (args.usageSessionId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sess } = await (supabaseAdmin as any)
      .from("usage_sessions")
      .select("id, user_id, status, ended_at")
      .eq("id", args.usageSessionId)
      .maybeSingle();
    if (!sess || sess.user_id !== args.userId) {
      return { ok: false, code: "session_not_found", message: "Sessão não encontrada." };
    }
    // Accept active or recently-ended (< 10min ago)
    if (sess.status !== "active") {
      const endedAt = sess.ended_at ? new Date(sess.ended_at).getTime() : 0;
      if (Date.now() - endedAt > 10 * 60 * 1000) {
        return { ok: false, code: "session_closed", message: "Sessão encerrada." };
      }
    }
  }

  // Server-owned model — ignore any client-reported divergence.
  const model = args.serverModel;
  const divergent =
    args.reportedModel && args.reportedModel !== args.serverModel
      ? { reported: args.reportedModel, used: args.serverModel }
      : null;
  if (divergent) console.warn("[ai-cost] model divergence", divergent);

  const now = new Date();
  const pricing = await fetchPricing(model, now);
  const costUsd = pricing ? computeCostUsd(tokens, pricing) : 0;
  const rate = await fetchExchangeRate();
  const costBrl = costUsd * rate;

  // Insert, tolerating duplicate provider_response_id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any).from("ai_usage_events").insert({
    user_id: args.userId,
    usage_session_id: args.usageSessionId ?? null,
    conversation_id: args.conversationId ?? null,
    provider: "openai",
    model,
    provider_response_id: args.providerResponseId ?? null,
    provider_event_id: args.providerEventId ?? null,
    event_type: args.eventType,
    ...tokens,
    estimated_cost_usd: costUsd,
    exchange_rate_brl: rate,
    estimated_cost_brl: costBrl,
    occurred_at: now.toISOString(),
    raw_usage: sanitizeRawUsage(args.usage),
  });

  if (error) {
    // Unique violation on (provider, provider_response_id) — treat as duplicate no-op.
    // Postgres error code 23505.
    if ((error as { code?: string }).code === "23505") {
      return { ok: true, duplicate: true, cost_usd: 0, cost_brl: 0, tokens, model };
    }
    console.error("[ai-cost] insert failed", error);
    return { ok: false, code: "insert_failed", message: "Falha ao registrar uso." };
  }

  // Roll up into usage_sessions
  if (args.usageSessionId) {
    await rollupUsageSession(args.usageSessionId).catch((e) =>
      console.error("[ai-cost] rollup failed", e),
    );
  }

  return { ok: true, cost_usd: costUsd, cost_brl: costBrl, tokens, model };
}

function sanitizeRawUsage(u: RealtimeUsagePayload): RealtimeUsagePayload {
  // Keep only numeric metadata; never persist transcripts or audio.
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    total_tokens: u.total_tokens,
    input_token_details: u.input_token_details,
    output_token_details: u.output_token_details,
  };
}

async function rollupUsageSession(sessionId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabaseAdmin as any)
    .from("ai_usage_events")
    .select(
      "model, input_text_tokens, cached_input_text_tokens, output_text_tokens, input_audio_tokens, cached_input_audio_tokens, output_audio_tokens, estimated_cost_usd, estimated_cost_brl",
    )
    .eq("usage_session_id", sessionId);
  const list = (rows ?? []) as Array<Record<string, unknown>>;
  type Totals = { itt: number; ott: number; iat: number; oat: number; cached: number; usd: number; brl: number };
  const totals: Totals = list.reduce<Totals>(
    (acc, r) => ({
      itt: acc.itt + Number(r.input_text_tokens ?? 0),
      ott: acc.ott + Number(r.output_text_tokens ?? 0),
      iat: acc.iat + Number(r.input_audio_tokens ?? 0),
      oat: acc.oat + Number(r.output_audio_tokens ?? 0),
      cached:
        acc.cached +
        Number(r.cached_input_text_tokens ?? 0) +
        Number(r.cached_input_audio_tokens ?? 0),
      usd: acc.usd + Number(r.estimated_cost_usd ?? 0),
      brl: acc.brl + Number(r.estimated_cost_brl ?? 0),
    }),
    { itt: 0, ott: 0, iat: 0, oat: 0, cached: 0, usd: 0, brl: 0 },
  );
  const model = (list[list.length - 1]?.model as string | undefined) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any)
    .from("usage_sessions")
    .update({
      ai_model: model,
      ai_input_text_tokens: totals.itt,
      ai_output_text_tokens: totals.ott,
      ai_input_audio_tokens: totals.iat,
      ai_output_audio_tokens: totals.oat,
      ai_cached_tokens: totals.cached,
      ai_estimated_cost_usd: totals.usd,
      ai_estimated_cost_brl: totals.brl,
      ai_events_count: list.length,
    })
    .eq("id", sessionId);
}

/**
 * Fire-and-forget helper for the cascade "text-speech" flow.
 * Silently records an event; never throws to the caller so a billing miss
 * cannot break the user-facing API response.
 */
export async function recordCascadeUsageSafe(args: {
  userId: string;
  usageSessionId: string | null;
  conversationId: string | null;
  model: string;              // provider-prefixed, e.g. "openai/gpt-4o-mini-tts"
  provider?: string;          // defaults to "openai"
  eventType: string;          // e.g. "stt.done" | "chat.done" | "tts.done"
  usage: RealtimeUsagePayload;
  providerResponseId?: string | null;
}): Promise<void> {
  try {
    if (!args.usageSessionId) return; // no session to attach to; skip.

    // Ownership check: only bill the session if it belongs to this user.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sess } = await (supabaseAdmin as any)
      .from("usage_sessions")
      .select("id, user_id")
      .eq("id", args.usageSessionId)
      .maybeSingle();
    if (!sess || sess.user_id !== args.userId) return;

    const tokens = parseRealtimeUsage(args.usage);

    const now = new Date();
    const pricing = await fetchPricing(args.model, now);
    const costUsd = pricing ? computeCostUsd(tokens, pricing) : 0;
    const rate = await fetchExchangeRate();
    const costBrl = costUsd * rate;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any).from("ai_usage_events").insert({
      user_id: args.userId,
      usage_session_id: args.usageSessionId,
      conversation_id: args.conversationId ?? null,
      provider: args.provider ?? "openai",
      model: args.model,
      provider_response_id: args.providerResponseId ?? null,
      event_type: args.eventType,
      ...tokens,
      estimated_cost_usd: costUsd,
      exchange_rate_brl: rate,
      estimated_cost_brl: costBrl,
      occurred_at: now.toISOString(),
      raw_usage: sanitizeRawUsage(args.usage),
    });
    if (error && (error as { code?: string }).code !== "23505") {
      console.warn("[ai-cost] cascade insert failed", error);
      return;
    }
    await rollupUsageSession(args.usageSessionId).catch((e) =>
      console.warn("[ai-cost] cascade rollup failed", e),
    );
  } catch (e) {
    console.warn("[ai-cost] recordCascadeUsageSafe", e);
  }
}

