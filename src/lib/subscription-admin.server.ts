// Server-only helpers for admin management of subscriptions.
// Uses supabaseAdmin (service role) — MUST NOT be imported from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  mpGetPreapproval,
  mpSearchPreapprovals,
  mpCancelPreapproval,
  normalizeStatus,
  MP_PREAPPROVAL_PLAN_ID,
  MercadoPagoApiError,
  type MpPreapproval,
} from "@/lib/mercado-pago.server";
import { syncPreapprovalById } from "@/lib/subscription.server";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export type Actor = {
  type: "user" | "admin" | "webhook" | "system";
  userId: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type AuditEntry = {
  subscriptionId?: string | null;
  userId?: string | null;
  actor: Actor;
  action: string;
  previous?: Json;
  next?: Json;
  reason?: string | null;
  providerReference?: string | null;
};

export async function insertAudit(e: AuditEntry): Promise<void> {
  try {
    await supabaseAdmin.from("subscription_audit_logs").insert({
      subscription_id: e.subscriptionId ?? null,
      user_id: e.userId ?? null,
      actor_user_id: e.actor.userId,
      actor_type: e.actor.type,
      action: e.action,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      previous_data: (e.previous ?? null) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new_data: (e.next ?? null) as any,
      reason: e.reason ?? null,
      provider_reference: e.providerReference ?? null,
      ip_address: e.actor.ip ?? null,
      user_agent: e.actor.userAgent ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  } catch (err) {
    console.error("[audit] insert failed", err);
  }
}

/** Snapshot the columns we care about for auditing (no PII beyond email). */
function snapshot(sub: Record<string, unknown> | null | undefined): Json {
  if (!sub) return null;
  const s = sub as Record<string, unknown>;
  return {
    id: s.id ?? null,
    status: s.status ?? null,
    provider_status: s.provider_status ?? null,
    provider_subscription_id: s.provider_subscription_id ?? null,
    minutes_used: s.minutes_used ?? null,
    minutes_available: s.minutes_available ?? null,
    monthly_minutes: s.monthly_minutes ?? null,
    current_period_start: s.current_period_start ?? null,
    current_period_end: s.current_period_end ?? null,
    next_payment_date: s.next_payment_date ?? null,
    canceled_at: s.canceled_at ?? null,
    payer_email: s.payer_email ?? null,
  };
}

async function fetchSub(subId: string) {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("id", subId)
    .maybeSingle();
  return data;
}

/**
 * Sync a single subscription against Mercado Pago.
 * Idempotent: does not renew minutes twice — that decision lives in
 * `syncPreapprovalById` (based on charged_quantity).
 */
export async function syncOne(
  subId: string,
  actor: Actor,
  action: string = "admin_resync",
): Promise<{
  ok: boolean;
  provider_status?: string | null;
  new_status?: string | null;
  error?: string;
}> {
  const before = await fetchSub(subId);
  if (!before) return { ok: false, error: "not_found" };

  let preapprovalId = (before.provider_subscription_id as string | null) ?? null;
  let remote: MpPreapproval | null = null;
  try {
    if (!preapprovalId) {
      // Fallback: search by external_reference (user_id).
      const search = await mpSearchPreapprovals({
        external_reference: (before.user_id as string) ?? "",
        preapproval_plan_id: MP_PREAPPROVAL_PLAN_ID,
        limit: 20,
      });
      const rank: Record<string, number> = {
        authorized: 0, active: 0, pending: 1, paused: 2,
        past_due: 3, payment_required: 3, cancelled: 4, canceled: 4,
      };
      const best = [...(search.results ?? [])].sort((a, b) => {
        const ra = rank[(a.status ?? "").toLowerCase()] ?? 9;
        const rb = rank[(b.status ?? "").toLowerCase()] ?? 9;
        if (ra !== rb) return ra - rb;
        return (b.date_created ?? "").localeCompare(a.date_created ?? "");
      })[0];
      preapprovalId = best?.id ?? null;
    }
    if (!preapprovalId) {
      await supabaseAdmin
        .from("subscriptions")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ last_synced_at: new Date().toISOString() } as any)
        .eq("id", subId);
      await insertAudit({
        subscriptionId: subId,
        userId: (before.user_id as string) ?? null,
        actor,
        action,
        previous: snapshot(before),
        next: snapshot(before),
        reason: "no_preapproval_found",
      });
      return { ok: true, provider_status: null, new_status: before.status as string };
    }

    remote = await mpGetPreapproval(preapprovalId);
    await syncPreapprovalById({
      ...remote,
      external_reference: remote.external_reference ?? (before.user_id as string) ?? null,
    });
    await supabaseAdmin
      .from("subscriptions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        last_synced_at: new Date().toISOString(),
        provider_status: remote.status ?? null,
      } as any)
      .eq("id", subId);

    const after = await fetchSub(subId);
    await insertAudit({
      subscriptionId: subId,
      userId: (before.user_id as string) ?? null,
      actor,
      action,
      previous: snapshot(before),
      next: snapshot(after),
      providerReference: preapprovalId,
    });
    return {
      ok: true,
      provider_status: remote.status ?? null,
      new_status: (after?.status as string) ?? null,
    };
  } catch (err) {
    const msg = err instanceof MercadoPagoApiError ? err.message : err instanceof Error ? err.message : String(err);
    await insertAudit({
      subscriptionId: subId,
      userId: (before.user_id as string) ?? null,
      actor,
      action: "sync_failed",
      previous: snapshot(before),
      reason: msg,
      providerReference: preapprovalId,
    });
    return { ok: false, error: msg };
  }
}

/**
 * Adjust minutes on a subscription with audit trail. Never changes
 * period/status. Cannot produce negative available minutes.
 */
export async function adjustMinutes(
  subId: string,
  operation: "add" | "remove" | "set",
  minutes: number,
  reason: string,
  actor: Actor,
): Promise<{ ok: boolean; error?: string; minutes_used?: number; minutes_available?: number }> {
  if (!(minutes >= 0) || !Number.isFinite(minutes)) return { ok: false, error: "invalid_minutes" };
  if (!reason || reason.trim().length < 3) return { ok: false, error: "reason_required" };
  if (minutes > 100000) return { ok: false, error: "minutes_too_large" };

  const before = await fetchSub(subId);
  if (!before) return { ok: false, error: "not_found" };

  const monthly = Number(before.monthly_minutes ?? 120);
  const currentUsed = Number(before.minutes_used ?? 0);

  let newUsed = currentUsed;
  if (operation === "add") {
    // "Add minutes" => decrease used, bounded at 0.
    newUsed = Math.max(0, currentUsed - minutes);
  } else if (operation === "remove") {
    // "Remove minutes" => increase used, bounded at monthly cap.
    newUsed = Math.min(monthly, currentUsed + minutes);
  } else {
    // set: target `minutes` available; used = monthly - available.
    const target = Math.max(0, Math.min(monthly, minutes));
    newUsed = Math.max(0, monthly - target);
  }
  const newAvailable = Math.max(0, monthly - newUsed);

  const { error } = await supabaseAdmin
    .from("subscriptions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      minutes_used: newUsed,
      minutes_available: newAvailable,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", subId);
  if (error) return { ok: false, error: error.message };

  const after = await fetchSub(subId);
  await insertAudit({
    subscriptionId: subId,
    userId: (before.user_id as string) ?? null,
    actor,
    action:
      operation === "add"
        ? "minutes_added_manually"
        : operation === "remove"
          ? "minutes_removed_manually"
          : "minutes_set_manually",
    previous: snapshot(before),
    next: snapshot(after),
    reason,
  });
  return {
    ok: true,
    minutes_used: newUsed,
    minutes_available: newAvailable,
  };
}

/**
 * Cancel a subscription in Mercado Pago and reflect the real API result in the DB.
 * NEVER cancels only locally.
 */
export async function cancelOne(
  subId: string,
  actor: Actor,
  reason: string,
): Promise<{ ok: boolean; error?: string; new_status?: string | null }> {
  const before = await fetchSub(subId);
  if (!before) return { ok: false, error: "not_found" };

  const providerId = before.provider_subscription_id as string | null;
  await insertAudit({
    subscriptionId: subId,
    userId: (before.user_id as string) ?? null,
    actor,
    action: "cancellation_requested",
    previous: snapshot(before),
    reason,
    providerReference: providerId ?? null,
  });

  if (!providerId) {
    await insertAudit({
      subscriptionId: subId,
      userId: (before.user_id as string) ?? null,
      actor,
      action: "cancellation_failed",
      reason: "no_provider_subscription_id",
    });
    return { ok: false, error: "Assinatura não possui ID no Mercado Pago." };
  }

  try {
    await mpCancelPreapproval(providerId);
    const remote = await mpGetPreapproval(providerId);
    await syncPreapprovalById({
      ...remote,
      external_reference: remote.external_reference ?? (before.user_id as string) ?? null,
    });
    await supabaseAdmin
      .from("subscriptions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        provider_status: remote.status ?? null,
        last_synced_at: new Date().toISOString(),
        cancellation_reason: reason,
      } as any)
      .eq("id", subId);
    const after = await fetchSub(subId);
    await insertAudit({
      subscriptionId: subId,
      userId: (before.user_id as string) ?? null,
      actor,
      action: "subscription_canceled",
      previous: snapshot(before),
      next: snapshot(after),
      reason,
      providerReference: providerId,
    });
    return { ok: true, new_status: normalizeStatus(remote.status) };
  } catch (err) {
    const msg = err instanceof MercadoPagoApiError ? err.message : err instanceof Error ? err.message : String(err);
    await insertAudit({
      subscriptionId: subId,
      userId: (before.user_id as string) ?? null,
      actor,
      action: "cancellation_failed",
      previous: snapshot(before),
      reason: msg,
      providerReference: providerId,
    });
    return { ok: false, error: msg };
  }
}

/**
 * Sync in batch with a small concurrency window. Returns a summary and per-id result.
 */
export async function syncBatch(
  filter: "all" | "pending" | "past_due" | "error",
  actor: Actor,
): Promise<{
  total: number;
  synced: number;
  updated: number;
  unchanged: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; error?: string; new_status?: string | null }>;
}> {
  let query = supabaseAdmin.from("subscriptions").select("id, status");
  if (filter === "pending") query = query.eq("status", "pending");
  else if (filter === "past_due") query = query.in("status", ["past_due", "payment_required"]);
  else if (filter === "error") query = query.is("provider_subscription_id", null);

  const { data: rows } = await query.limit(500);
  const list = (rows ?? []) as Array<{ id: string; status: string }>;

  const CONCURRENCY = 3;
  const results: Array<{ id: string; ok: boolean; error?: string; new_status?: string | null }> = [];
  let synced = 0, updated = 0, unchanged = 0, failed = 0;

  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const chunk = list.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (row) => {
        const r = await syncOne(row.id, actor, "admin_resync_batch");
        if (!r.ok) return { id: row.id, ok: false, error: r.error };
        return {
          id: row.id,
          ok: true,
          new_status: r.new_status ?? null,
          changed: r.new_status !== row.status,
        } as const;
      }),
    );
    for (const r of chunkResults) {
      if (!r.ok) failed++;
      else {
        synced++;
        if ("changed" in r && r.changed) updated++;
        else unchanged++;
      }
      results.push(r as { id: string; ok: boolean; error?: string; new_status?: string | null });
    }
  }

  return { total: list.length, synced, updated, unchanged, failed, results };
}
