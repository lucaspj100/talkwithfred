import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Get the current authenticated user's subscription (or null).
 */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/**
 * Check whether the current user can start a voice/text conversation.
 * Returns a lightweight object used by route guards.
 */
export const getSubscriptionAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("subscriptions")
      .select("status, minutes_available, minutes_used, monthly_minutes")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return { hasSubscription: false, hasAccess: false, reason: "none" as const, status: null, minutesAvailable: 0 };
    const active = data.status === "authorized" || data.status === "active";
    if (!active) return { hasSubscription: true, hasAccess: false, reason: data.status as string, status: data.status, minutesAvailable: Number(data.minutes_available) };
    if (Number(data.minutes_available) <= 0) return { hasSubscription: true, hasAccess: false, reason: "no_minutes" as const, status: data.status, minutesAvailable: 0 };
    return { hasSubscription: true, hasAccess: true, reason: "ok" as const, status: data.status, minutesAvailable: Number(data.minutes_available) };
  });

/**
 * Create (or reuse) a Mercado Pago preapproval for the current user
 * and return its init_point so the client can redirect.
 */
export const createMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    // 1. Reuse existing non-terminated subscription if any
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "authorized", "active", "paused", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && (existing.status === "authorized" || existing.status === "active")) {
      return {
        already_active: true as const,
        subscription_id: existing.provider_subscription_id,
        status: existing.status,
      };
    }

    const email = (claims.email as string | undefined) ?? existing?.payer_email ?? null;
    if (!email) {
      throw new Error("Email do usuário não encontrado. Faça login novamente.");
    }

    const { mpCreatePreapproval, mpGetPreapproval, normalizeStatus } = await import(
      "@/lib/mercado-pago.server"
    );

    // Reuse pending preapproval if we have one (avoids duplicates)
    if (existing?.provider_subscription_id && existing.status === "pending") {
      try {
        const remote = await mpGetPreapproval(existing.provider_subscription_id);
        if (remote?.init_point) {
          return {
            already_active: false as const,
            subscription_id: existing.provider_subscription_id,
            init_point: remote.init_point,
            status: normalizeStatus(remote.status),
          };
        }
      } catch {
        // fall through to create a new one
      }
    }

    const preapproval = await mpCreatePreapproval({
      payerEmail: email,
      externalReference: userId,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      user_id: userId,
      provider: "mercado_pago",
      provider_subscription_id: preapproval.id,
      provider_plan_id: preapproval.preapproval_plan_id ?? null,
      payer_email: preapproval.payer_email ?? email,
      status: normalizeStatus(preapproval.status),
      next_payment_date: preapproval.next_payment_date ?? null,
    };

    if (existing) {
      await supabaseAdmin
        .from("subscriptions")
        .update(row)
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("subscriptions").insert(row);
    }

    return {
      already_active: false as const,
      subscription_id: preapproval.id,
      init_point: preapproval.init_point,
      status: normalizeStatus(preapproval.status),
    };
  });

/**
 * Re-query Mercado Pago for the current user's subscription and persist it.
 * Used by the /assinatura/retorno page to confirm activation.
 */
export const refreshMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.provider_subscription_id) return { status: sub?.status ?? null };

    const { mpGetPreapproval, normalizeStatus } = await import("@/lib/mercado-pago.server");
    const { syncPreapprovalById } = await import("@/lib/subscription.server");
    const remote = await mpGetPreapproval(sub.provider_subscription_id);
    await syncPreapprovalById(remote);
    return { status: normalizeStatus(remote.status) };
  });
