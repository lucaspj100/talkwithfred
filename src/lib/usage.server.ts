// Server-only helpers for the 90-minute usage control system.
// Uses the admin client so users cannot manipulate seconds/minutes columns.
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const MONTHLY_MINUTES = 90;
export const MONTHLY_SECONDS = MONTHLY_MINUTES * 60; // 5400
export const HEARTBEAT_INTERVAL_SECONDS = 15;
export const MAX_HEARTBEAT_INCREMENT_SECONDS = 25; // clamp for delayed heartbeats
export const ABANDON_TIMEOUT_SECONDS = 60;

const ACTIVE_STATUSES = new Set(["active", "authorized"]);

export type StartResult =
  | {
      ok: true;
      usage_session_id: string;
      session_token: string;
      seconds_available: number;
      minutes_available: number;
      heartbeat_interval_seconds: number;
    }
  | {
      ok: false;
      code:
        | "no_subscription"
        | "pending"
        | "blocked"
        | "no_minutes"
        | "another_active_session";
      message: string;
      status?: string | null;
    };

export type HeartbeatResult =
  | {
      ok: true;
      seconds_used: number;
      seconds_available: number;
      minutes_available: number;
      ended?: boolean;
      close_reason?: string;
    }
  | { ok: false; code: "not_found" | "invalid_token" | "ended"; message: string };

export type StopResult = {
  ok: true;
  seconds_used: number;
  minutes_available: number;
  already_ended: boolean;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Auto-close sessions that have not sent a heartbeat within ABANDON_TIMEOUT_SECONDS.
 * The time already consumed at the last heartbeat has already been debited from
 * the subscription, so we only close the row here — no additional debit.
 */
export async function cleanupAbandonedForUser(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - ABANDON_TIMEOUT_SECONDS * 1000).toISOString();
  await supabaseAdmin
    .from("usage_sessions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      status: "abandoned",
      close_reason: "heartbeat_timeout",
      ended_at: new Date().toISOString(),
    } as any)
    .eq("user_id", userId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq("status", "active" as any)
    .or(`last_heartbeat_at.lt.${cutoff},last_heartbeat_at.is.null`);
}

async function fetchActiveSubscription(userId: string) {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function startUsageSession(
  userId: string,
  opts: { conversationId?: string | null; mode?: "voice" | "text"; force?: boolean },
): Promise<StartResult> {
  // 1. Abandoned cleanup first — so an old stuck row does not block a new one.
  await cleanupAbandonedForUser(userId);

  const sub = await fetchActiveSubscription(userId);
  if (!sub) {
    return { ok: false, code: "no_subscription", message: "Você ainda não tem uma assinatura ativa." };
  }
  if (sub.status === "pending") {
    return { ok: false, code: "pending", message: "Seu pagamento ainda está sendo confirmado.", status: sub.status };
  }
  if (!ACTIVE_STATUSES.has(sub.status)) {
    return {
      ok: false,
      code: "blocked",
      message: "Sua assinatura não está ativa no momento.",
      status: sub.status,
    };
  }
  const minutesAvailable = Number(sub.minutes_available);
  if (!(minutesAvailable > 0)) {
    return {
      ok: false,
      code: "no_minutes",
      message: "Você utilizou os 120 minutos deste ciclo.",
      status: sub.status,
    };
  }

  // 2. Handle existing active session for this user.
  const { data: existing } = await supabaseAdmin
    .from("usage_sessions")
    .select("id, last_heartbeat_at, started_at")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq("user_id", userId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq("status", "active" as any)
    .maybeSingle();

  if (existing) {
    if (!opts.force) {
      return {
        ok: false,
        code: "another_active_session",
        message: "Já existe uma conversa ativa em outra aba.",
      };
    }
    // Force: close the previous session (idempotent, no time debit here).
    await supabaseAdmin
      .from("usage_sessions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        status: "completed",
        close_reason: "superseded",
        ended_at: new Date().toISOString(),
      } as any)
      .eq("id", existing.id);
  }

  // 3. Insert new session.
  const rawToken = randomBytes(32).toString("hex");
  const nowIso = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("usage_sessions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      user_id: userId,
      subscription_id: sub.id,
      conversation_id: opts.conversationId ?? null,
      mode: opts.mode ?? "voice",
      status: "active",
      session_token_hash: hashToken(rawToken),
      started_at: nowIso,
      last_heartbeat_at: nowIso,
      seconds_used: 0,
      minutes_used: 0,
    } as any)
    .select("id")
    .single();
  if (insErr || !inserted) {
    console.error("[usage.start] insert failed", insErr);
    return { ok: false, code: "blocked", message: "Não foi possível iniciar a sessão. Tente novamente." };
  }

  const secondsAvailable = Math.max(0, Math.round(minutesAvailable * 60));
  return {
    ok: true,
    usage_session_id: inserted.id,
    session_token: rawToken,
    seconds_available: secondsAvailable,
    minutes_available: minutesAvailable,
    heartbeat_interval_seconds: HEARTBEAT_INTERVAL_SECONDS,
  };
}

export async function heartbeatUsageSession(
  userId: string,
  sessionId: string,
  token: string,
): Promise<HeartbeatResult> {
  const { data: session } = await supabaseAdmin
    .from("usage_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.user_id !== userId) {
    return { ok: false, code: "not_found", message: "Sessão de uso não encontrada." };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stored = (session as any).session_token_hash as string | null;
  if (!stored || stored !== hashToken(token)) {
    return { ok: false, code: "invalid_token", message: "Token de sessão inválido." };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((session as any).status !== "active") {
    return { ok: false, code: "ended", message: "Sessão já encerrada." };
  }

  const now = new Date();
  const lastHb = session.last_heartbeat_at
    ? new Date(session.last_heartbeat_at as string).getTime()
    : new Date(session.started_at as string).getTime();
  const rawDelta = Math.max(0, Math.floor((now.getTime() - lastHb) / 1000));
  // Clamp: reject "future" deltas and cap accelerated heartbeats.
  const delta = Math.min(rawDelta, MAX_HEARTBEAT_INCREMENT_SECONDS);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextSecondsUsed = Number((session as any).seconds_used ?? 0) + delta;

  // Debit subscription.
  const sub = await fetchActiveSubscription(userId);
  if (!sub) {
    return { ok: false, code: "ended", message: "Assinatura não encontrada." };
  }
  const minutesUsedNew = Number(sub.minutes_used) + delta / 60;
  const monthly = Number(sub.monthly_minutes ?? MONTHLY_MINUTES);
  const minutesAvailable = Math.max(0, monthly - minutesUsedNew);
  const secondsAvailable = Math.round(minutesAvailable * 60);

  const willEnd = minutesAvailable <= 0;

  await supabaseAdmin
    .from("subscriptions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      minutes_used: minutesUsedNew,
      minutes_available: minutesAvailable,
      updated_at: now.toISOString(),
    } as any)
    .eq("id", sub.id);

  await supabaseAdmin
    .from("usage_sessions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      seconds_used: nextSecondsUsed,
      minutes_used: nextSecondsUsed / 60,
      last_heartbeat_at: now.toISOString(),
      ...(willEnd
        ? { status: "completed", close_reason: "out_of_minutes", ended_at: now.toISOString() }
        : {}),
    } as any)
    .eq("id", sessionId);

  return {
    ok: true,
    seconds_used: nextSecondsUsed,
    seconds_available: secondsAvailable,
    minutes_available: minutesAvailable,
    ended: willEnd,
    close_reason: willEnd ? "out_of_minutes" : undefined,
  };
}

export async function stopUsageSession(
  userId: string,
  sessionId: string,
  token: string,
  reason: string = "user_stopped",
): Promise<StopResult> {
  const { data: session } = await supabaseAdmin
    .from("usage_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.user_id !== userId) {
    // Idempotent: report as already ended.
    return { ok: true, seconds_used: 0, minutes_available: 0, already_ended: true };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stored = (session as any).session_token_hash as string | null;
  if (!stored || stored !== hashToken(token)) {
    return { ok: true, seconds_used: 0, minutes_available: 0, already_ended: true };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((session as any).status !== "active") {
    // Idempotent no-op.
    const sub = await fetchActiveSubscription(userId);
    return {
      ok: true,
      seconds_used: Number((session as { seconds_used?: number }).seconds_used ?? 0),
      minutes_available: Number(sub?.minutes_available ?? 0),
      already_ended: true,
    };
  }

  // Consolidate the final interval (same clamp rules as heartbeat).
  const now = new Date();
  const lastHb = session.last_heartbeat_at
    ? new Date(session.last_heartbeat_at as string).getTime()
    : new Date(session.started_at as string).getTime();
  const rawDelta = Math.max(0, Math.floor((now.getTime() - lastHb) / 1000));
  const delta = Math.min(rawDelta, MAX_HEARTBEAT_INCREMENT_SECONDS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextSecondsUsed = Number((session as any).seconds_used ?? 0) + delta;

  const sub = await fetchActiveSubscription(userId);
  let minutesAvailable = 0;
  if (sub) {
    const minutesUsedNew = Number(sub.minutes_used) + delta / 60;
    const monthly = Number(sub.monthly_minutes ?? MONTHLY_MINUTES);
    minutesAvailable = Math.max(0, monthly - minutesUsedNew);
    await supabaseAdmin
      .from("subscriptions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        minutes_used: minutesUsedNew,
        minutes_available: minutesAvailable,
        updated_at: now.toISOString(),
      } as any)
      .eq("id", sub.id);
  }

  await supabaseAdmin
    .from("usage_sessions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      seconds_used: nextSecondsUsed,
      minutes_used: nextSecondsUsed / 60,
      last_heartbeat_at: now.toISOString(),
      ended_at: now.toISOString(),
      status: "completed",
      close_reason: reason,
    } as any)
    .eq("id", sessionId);

  return {
    ok: true,
    seconds_used: nextSecondsUsed,
    minutes_available: minutesAvailable,
    already_ended: false,
  };
}
