// Server-only helpers for syncing subscription state from Mercado Pago.
// Uses the admin client, so the filename MUST end in `.server.ts` to keep
// this module out of client bundles.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeStatus, type MpPreapproval, type MpPayment } from "@/lib/mercado-pago.server";

const MONTHLY_MINUTES = 120;

/**
 * Update or insert the local subscriptions row based on a MP preapproval payload.
 * Renews the 120-minute quota when a NEW payment is detected (idempotent).
 */
export async function syncPreapprovalById(remote: MpPreapproval): Promise<void> {
  if (!remote?.id) return;
  const userId = remote.external_reference || null;
  const status = normalizeStatus(remote.status);

  // Find existing row (prefer by provider_subscription_id, fall back to user_id).
  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("provider_subscription_id", remote.id)
    .maybeSingle();

  const nextPaymentDate = remote.next_payment_date ?? null;
  const lastChargedDate = remote.summarized?.last_charged_date ?? null;
  const chargedQuantity = Number(remote.summarized?.charged_quantity ?? 0);

  const base: Record<string, unknown> = {
    provider: "mercado_pago",
    provider_subscription_id: remote.id,
    provider_plan_id: remote.preapproval_plan_id ?? null,
    payer_email: remote.payer_email ?? null,
    status,
    next_payment_date: nextPaymentDate,
    last_payment_at: lastChargedDate,
    updated_at: new Date().toISOString(),
  };

  if (status === "cancelled") {
    base.canceled_at = new Date().toISOString();
  }

  // Detect a NEW payment: charged_quantity increased since last sync.
  let renew = false;
  if (existing) {
    const prevCharged = Number(
      (existing as { last_charged_quantity?: number | null }).last_charged_quantity ?? 0,
    );
    if (
      (status === "authorized" || status === "active") &&
      chargedQuantity > prevCharged
    ) {
      renew = true;
    }
    // First-time activation also counts as a period start.
    if (
      (status === "authorized" || status === "active") &&
      !existing.current_period_start
    ) {
      renew = true;
    }
  } else if (status === "authorized" || status === "active") {
    renew = true;
  }

  if (renew) {
    const now = new Date();
    const end = nextPaymentDate ? new Date(nextPaymentDate) : new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    base.current_period_start = now.toISOString();
    base.current_period_end = end.toISOString();
    base.monthly_minutes = MONTHLY_MINUTES;
    base.minutes_used = 0;
    base.minutes_available = MONTHLY_MINUTES;
    base.last_payment_status = "approved";
  }

  if (existing) {
    await supabaseAdmin
      .from("subscriptions")
      .update(base)
      .eq("id", existing.id);
  } else if (userId) {
    await supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      ...base,
    });
  } else {
    console.warn("[subscription.server] preapproval without external_reference and no local row", remote.id);
  }
}

/**
 * Handle a MP payment.updated / payment.created notification.
 * We prefer to re-fetch the preapproval afterwards.
 */
export async function syncPaymentById(payment: MpPayment): Promise<{ preapprovalId?: string | null }> {
  const preapprovalId = payment.metadata?.preapproval_id ?? null;
  if (preapprovalId) {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("provider_subscription_id", preapprovalId)
      .maybeSingle();
    if (sub) {
      await supabaseAdmin
        .from("subscriptions")
        .update({
          last_payment_status: payment.status,
          last_payment_at: payment.date_approved ?? payment.date_created ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);
    }
  }
  return { preapprovalId };
}
