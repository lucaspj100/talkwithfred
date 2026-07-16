// Admin-facing server functions for subscription management.
// All functions verify admin role using the request-scoped Supabase client (RLS).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function ensureAdmin(ctx: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
}) {
  const { data } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Forbidden");
}

export type AdminSubscriptionRow = {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  status: string;
  provider_status: string | null;
  provider_subscription_id: string | null;
  provider_plan_id: string | null;
  payer_email: string | null;
  monthly_minutes: number;
  minutes_used: number;
  minutes_available: number;
  current_period_start: string | null;
  current_period_end: string | null;
  next_payment_date: string | null;
  last_payment_at: string | null;
  last_synced_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
};

const listInput = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(["all", "authorized", "active", "pending", "paused", "cancelled", "past_due"]).default("all"),
  balance: z.enum(["all", "has_balance", "no_balance"]).default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  sort: z.enum(["created_desc", "created_asc", "usage_desc", "available_asc", "next_asc"]).default("created_desc"),
});

export const listAdminSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => listInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin.from("subscriptions").select("*", { count: "exact" });
    if (data.status !== "all") {
      if (data.status === "active") q = q.in("status", ["active", "authorized"]);
      else if (data.status === "past_due") q = q.in("status", ["past_due", "payment_required"]);
      else q = q.eq("status", data.status);
    }
    if (data.balance === "has_balance") q = q.gt("minutes_available", 0);
    if (data.balance === "no_balance") q = q.lte("minutes_available", 0);
    if (data.search) {
      const like = `%${data.search}%`;
      q = q.or(`payer_email.ilike.${like},provider_subscription_id.ilike.${like}`);
    }

    switch (data.sort) {
      case "created_asc": q = q.order("created_at", { ascending: true }); break;
      case "usage_desc": q = q.order("minutes_used", { ascending: false }); break;
      case "available_asc": q = q.order("minutes_available", { ascending: true }); break;
      case "next_asc": q = q.order("next_payment_date", { ascending: true, nullsFirst: false }); break;
      default: q = q.order("created_at", { ascending: false });
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: subs, count } = await q.range(from, to);
    const rows = (subs ?? []) as Array<Record<string, unknown>>;

    // Enrich with profile name/email.
    const userIds = Array.from(new Set(rows.map((r) => r.user_id as string).filter(Boolean)));
    let profileMap = new Map<string, { name: string | null; email: string | null }>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);
      profileMap = new Map(
        (profs ?? []).map((p) => [p.id as string, { name: p.name ?? null, email: p.email ?? null }]),
      );
    }

    // Post-filter by search matching name.
    let items = rows.map((r) => {
      const p = profileMap.get(r.user_id as string);
      return {
        id: r.id as string,
        user_id: r.user_id as string,
        user_name: p?.name ?? null,
        user_email: p?.email ?? (r.payer_email as string | null) ?? null,
        status: r.status as string,
        provider_status: (r.provider_status as string | null) ?? null,
        provider_subscription_id: (r.provider_subscription_id as string | null) ?? null,
        provider_plan_id: (r.provider_plan_id as string | null) ?? null,
        payer_email: (r.payer_email as string | null) ?? null,
        monthly_minutes: Number(r.monthly_minutes ?? 90),
        minutes_used: Number(r.minutes_used ?? 0),
        minutes_available: Number(r.minutes_available ?? 0),
        current_period_start: (r.current_period_start as string | null) ?? null,
        current_period_end: (r.current_period_end as string | null) ?? null,
        next_payment_date: (r.next_payment_date as string | null) ?? null,
        last_payment_at: (r.last_payment_at as string | null) ?? null,
        last_synced_at: (r.last_synced_at as string | null) ?? null,
        canceled_at: (r.canceled_at as string | null) ?? null,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      } as AdminSubscriptionRow;
    });

    if (data.search) {
      const s = data.search.toLowerCase();
      items = items.filter(
        (r) =>
          (r.user_name ?? "").toLowerCase().includes(s) ||
          (r.user_email ?? "").toLowerCase().includes(s) ||
          (r.payer_email ?? "").toLowerCase().includes(s) ||
          (r.provider_subscription_id ?? "").toLowerCase().includes(s),
      );
    }

    return { items, total: count ?? items.length, page: data.page, pageSize: data.pageSize };
  });

export const getAdminSubscriptionMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("subscriptions")
      .select("status, minutes_used, minutes_available");
    const list = (rows ?? []) as Array<{ status: string; minutes_used: number; minutes_available: number }>;
    const total = list.length;
    const active = list.filter((s) => s.status === "active" || s.status === "authorized").length;
    const pending = list.filter((s) => s.status === "pending").length;
    const cancelled = list.filter((s) => s.status === "cancelled" || s.status === "canceled").length;
    const pastDue = list.filter((s) => s.status === "past_due" || s.status === "payment_required").length;
    const zero = list.filter(
      (s) => (s.status === "active" || s.status === "authorized") && Number(s.minutes_available) <= 0,
    ).length;
    const minutesUsed = list.reduce((a, s) => a + Number(s.minutes_used ?? 0), 0);
    const mrr = active * 49;
    return { total, active, pending, cancelled, past_due: pastDue, zero_minutes: zero, minutes_used_cycle: minutesUsed, mrr_estimate: mrr };
  });

const idInput = z.object({ id: z.string().uuid() });

export const getAdminSubscriptionDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => idInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!sub) throw new Error("Assinatura não encontrada.");

    const [{ data: profile }, { data: events }, { data: audit }, { data: sessions }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, email").eq("id", sub.user_id).maybeSingle(),
      supabaseAdmin
        .from("subscription_events")
        .select("id, event_type, provider_event_id, provider_status, processed, created_at")
        .eq("user_id", sub.user_id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("subscription_audit_logs")
        .select("*")
        .eq("subscription_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("usage_sessions")
        .select("id, mode, status, started_at, ended_at, seconds_used, close_reason")
        .eq("user_id", sub.user_id)
        .order("started_at", { ascending: false })
        .limit(30),
    ]);

    return { subscription: sub, profile, events: events ?? [], audit: audit ?? [], sessions: sessions ?? [] };
  });

function actorFromRequest(userId: string, headers: Headers | undefined) {
  return {
    type: "admin" as const,
    userId,
    ip:
      headers?.get("cf-connecting-ip") ??
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
    userAgent: headers?.get("user-agent") ?? null,
  };
}

export const syncAdminSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => idInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { syncOne } = await import("@/lib/subscription-admin.server");
    return syncOne(data.id, { type: "admin", userId: context.userId });
  });

const batchInput = z.object({
  filter: z.enum(["all", "pending", "past_due", "error"]).default("pending"),
});

export const syncAdminSubscriptionsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => batchInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { syncBatch } = await import("@/lib/subscription-admin.server");
    return syncBatch(data.filter, { type: "admin", userId: context.userId });
  });

const adjustInput = z.object({
  id: z.string().uuid(),
  operation: z.enum(["add", "remove", "set"]),
  minutes: z.number().min(0).max(100000),
  reason: z.string().min(3).max(500),
});

export const adjustAdminSubscriptionMinutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => adjustInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { adjustMinutes } = await import("@/lib/subscription-admin.server");
    const res = await adjustMinutes(data.id, data.operation, data.minutes, data.reason, {
      type: "admin",
      userId: context.userId,
    });
    if (!res.ok) throw new Error(res.error ?? "Falha ao ajustar minutos.");
    return res;
  });

const cancelInput = z.object({
  id: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const cancelAdminSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => cancelInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { cancelOne } = await import("@/lib/subscription-admin.server");
    const res = await cancelOne(data.id, { type: "admin", userId: context.userId }, data.reason);
    if (!res.ok) throw new Error(res.error ?? "Falha ao cancelar.");
    return res;
  });

/** CSV export of the currently-filtered list. */
export const exportAdminSubscriptionsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => listInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("subscriptions").select("*").limit(5000);
    if (data.status !== "all") {
      if (data.status === "active") q = q.in("status", ["active", "authorized"]);
      else if (data.status === "past_due") q = q.in("status", ["past_due", "payment_required"]);
      else q = q.eq("status", data.status);
    }
    if (data.balance === "has_balance") q = q.gt("minutes_available", 0);
    if (data.balance === "no_balance") q = q.lte("minutes_available", 0);
    const { data: rows } = await q.order("created_at", { ascending: false });
    const list = (rows ?? []) as Array<Record<string, unknown>>;

    const uids = Array.from(new Set(list.map((r) => r.user_id as string).filter(Boolean)));
    let pmap = new Map<string, { name: string | null; email: string | null }>();
    if (uids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, name, email").in("id", uids);
      pmap = new Map((profs ?? []).map((p) => [p.id as string, { name: p.name ?? null, email: p.email ?? null }]));
    }

    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = [
      "nome","email","status","plano","minutos_usados","minutos_disponiveis",
      "proxima_cobranca","criado_em","provider_subscription_id",
    ];
    const csvRows = [header.join(",")];
    for (const r of list) {
      const p = pmap.get(r.user_id as string);
      csvRows.push([
        esc(p?.name ?? ""),
        esc(p?.email ?? r.payer_email ?? ""),
        esc(r.status),
        esc(r.plan_name ?? "Talk With Fred"),
        esc(Number(r.minutes_used ?? 0).toFixed(2)),
        esc(Number(r.minutes_available ?? 0).toFixed(2)),
        esc(r.next_payment_date ?? ""),
        esc(r.created_at ?? ""),
        esc(r.provider_subscription_id ?? ""),
      ].join(","));
    }
    return { csv: csvRows.join("\n"), count: list.length };
  });
