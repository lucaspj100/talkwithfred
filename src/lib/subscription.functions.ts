import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    // 2. Validate email
    const email = ((claims.email as string | undefined) ?? existing?.payer_email ?? "").trim();
    if (!email) {
      throw new Error("Seu e-mail não está disponível. Faça login novamente.");
    }
    if (!EMAIL_RE.test(email)) {
      throw new Error("O e-mail da sua conta é inválido. Atualize no seu perfil e tente novamente.");
    }

    const {
      buildCheckoutUrl,
      mpGetPreapprovalPlan,
      MP_PREAPPROVAL_PLAN_ID,
      MercadoPagoApiError,
    } = await import("@/lib/mercado-pago.server");

    // 3. Pre-flight: validate plan exists / token owns it. Surfaces real 401/404.
    try {
      await mpGetPreapprovalPlan(MP_PREAPPROVAL_PLAN_ID);
    } catch (e) {
      if (e instanceof MercadoPagoApiError) {
        console.error("[createMySubscription] plan preflight failed", {
          status: e.status,
          code: e.code,
          mpMessage: e.mpMessage,
        });
        throw new Error(e.message);
      }
      throw e;
    }

    // 4. Build hosted-checkout URL. Mercado Pago's POST /preapproval requires
    //    a `card_token_id` when linked to a plan, which our redirect flow does
    //    not have. The plan's hosted checkout collects the card + email and
    //    creates the preapproval, then notifies our webhook.
    const initPoint = buildCheckoutUrl({
      externalReference: userId,
      payerEmail: email,
    });

    // 5. Upsert a local pending row. provider_subscription_id will be filled
    //    by the webhook once MP creates the preapproval.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      user_id: userId,
      provider: "mercado_pago",
      provider_plan_id: MP_PREAPPROVAL_PLAN_ID,
      payer_email: email,
      status: "pending",
    };
    if (existing) {
      await supabaseAdmin.from("subscriptions").update(row).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("subscriptions").insert(row);
    }

    return {
      already_active: false as const,
      subscription_id: existing?.provider_subscription_id ?? null,
      init_point: initPoint,
      status: "pending" as const,
      
    };
  });

/**
 * Re-query Mercado Pago for the current user's subscription and persist it.
 */
export const refreshMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { preapprovalId?: string } | undefined) => data ?? {})
  .handler(async ({ context, data }) => {
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const preapprovalId = data.preapprovalId || sub?.provider_subscription_id || null;
    if (!preapprovalId) return { status: sub?.status ?? null };

    const { mpGetPreapproval, normalizeStatus } = await import("@/lib/mercado-pago.server");
    const { syncPreapprovalById } = await import("@/lib/subscription.server");
    const remote = await mpGetPreapproval(preapprovalId);
    // Guard: only sync if this preapproval belongs to the caller.
    if (remote.external_reference && remote.external_reference !== context.userId) {
      return { status: sub?.status ?? null };
    }
    await syncPreapprovalById(remote);
    return { status: normalizeStatus(remote.status) };
  });

/**
 * Admin-only diagnostic. Returns whether the MP token is loaded,
 * whether the plan can be fetched with it, and sanitized details.
 * Never returns the token itself.
 */
export const diagnoseMercadoPago = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const {
      readAccessToken,
      mpGetPreapprovalPlan,
      MP_PREAPPROVAL_PLAN_ID,
      MercadoPagoApiError,
    } = await import("@/lib/mercado-pago.server");

    const tok = readAccessToken();
    const result: Record<string, string | number | boolean | null> = {
      secret_exists: !!tok.token,
      token_prefix: tok.prefix,
      token_length: tok.length,
      token_had_whitespace: tok.trimmed_diff > 0,
      plan_id: MP_PREAPPROVAL_PLAN_ID,
    };
    if (!tok.token) return result;

    try {
      const plan = await mpGetPreapprovalPlan(MP_PREAPPROVAL_PLAN_ID);
      result.plan_http_status = 200;
      result.plan_found = true;
      result.plan_status = plan.status ?? null;
      result.plan_reason = plan.reason ?? null;
      result.plan_application_id = plan.application_id != null ? String(plan.application_id) : null;
      result.plan_collector_id = plan.collector_id != null ? String(plan.collector_id) : null;
      result.plan_transaction_amount = plan.auto_recurring?.transaction_amount ?? null;
      result.plan_currency_id = plan.auto_recurring?.currency_id ?? null;
    } catch (e) {
      if (e instanceof MercadoPagoApiError) {
        result.plan_http_status = e.status;
        result.plan_found = false;
        result.plan_error_code = e.code;
        result.plan_error_message = e.mpMessage;
        result.plan_error_friendly = e.message;
      } else {
        result.plan_error_friendly = e instanceof Error ? e.message : String(e);
      }
    }
    return result;
  });

