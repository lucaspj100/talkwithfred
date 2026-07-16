// Admin server functions for AI cost tracking. All verify admin role via RLS-scoped supabase client.
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

const MONTHLY_PRICE_BRL = 49;

export const getAiCostSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const days = Math.min(Math.max(Number(data.days ?? 30), 1), 180);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          gte: (col: string, v: string) => Promise<{ data: unknown[] | null }>;
        };
      };
    };

    const eventsMonthPromise = admin
      .from("ai_usage_events")
      .select("user_id, model, occurred_at, estimated_cost_usd, estimated_cost_brl, input_audio_tokens, output_audio_tokens, cached_input_audio_tokens, input_text_tokens, output_text_tokens, cached_input_text_tokens")
      .gte("occurred_at", monthStart.toISOString());

    const eventsWindowPromise = admin
      .from("ai_usage_events")
      .select("occurred_at, estimated_cost_brl")
      .gte("occurred_at", since);

    const [eventsMonth, eventsWindow, financeRes, subsRes] = await Promise.all([
      eventsMonthPromise,
      eventsWindowPromise,
      (context.supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (c: string, v: number) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } } } })
        .from("finance_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle(),
      (context.supabase as unknown as { from: (t: string) => { select: (s: string) => Promise<{ data: unknown[] | null }> } })
        .from("subscriptions")
        .select("id, user_id, status"),
    ]);

    type Ev = {
      user_id: string;
      model: string;
      occurred_at: string;
      estimated_cost_usd: number;
      estimated_cost_brl: number;
      input_audio_tokens: number;
      output_audio_tokens: number;
      cached_input_audio_tokens: number;
      input_text_tokens: number;
      output_text_tokens: number;
      cached_input_text_tokens: number;
    };
    const monthList = (eventsMonth.data ?? []) as Ev[];
    const windowList = (eventsWindow.data ?? []) as { occurred_at: string; estimated_cost_brl: number }[];
    const finance = (financeRes.data ?? {}) as Record<string, unknown>;
    const subs = (subsRes.data ?? []) as { user_id: string; status: string }[];

    const activeSubs = subs.filter((s) => ["authorized", "active"].includes(s.status));
    const activeSubCount = activeSubs.length;

    const totalCostBrlMonth = monthList.reduce((a, e) => a + Number(e.estimated_cost_brl ?? 0), 0);
    const totalCostUsdMonth = monthList.reduce((a, e) => a + Number(e.estimated_cost_usd ?? 0), 0);
    const totalCostBrlToday = monthList
      .filter((e) => new Date(e.occurred_at) >= todayStart)
      .reduce((a, e) => a + Number(e.estimated_cost_brl ?? 0), 0);

    const inAudio = monthList.reduce((a, e) => a + Number(e.input_audio_tokens ?? 0) + Number(e.cached_input_audio_tokens ?? 0), 0);
    const outAudio = monthList.reduce((a, e) => a + Number(e.output_audio_tokens ?? 0), 0);

    const revenueMonth = activeSubCount * MONTHLY_PRICE_BRL;
    const feePct = Number(finance.mercado_pago_fee_percent ?? 0);
    const taxPct = Number(finance.tax_percent ?? 0);
    const fixedCost = Number(finance.monthly_fixed_cost_brl ?? 0);
    const netRevenue = revenueMonth * (1 - feePct / 100 - taxPct / 100);
    const marginBrl = netRevenue - totalCostBrlMonth - fixedCost;
    const marginPct = netRevenue > 0 ? (marginBrl / netRevenue) * 100 : 0;

    // Per-day cost series (window)
    const dayMap = new Map<string, number>();
    for (const e of windowList) {
      const d = e.occurred_at.slice(0, 10);
      dayMap.set(d, (dayMap.get(d) ?? 0) + Number(e.estimated_cost_brl ?? 0));
    }
    const daily = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({ day, value }));

    // Top user this month
    const perUser = new Map<string, number>();
    for (const e of monthList) {
      perUser.set(e.user_id, (perUser.get(e.user_id) ?? 0) + Number(e.estimated_cost_brl ?? 0));
    }
    const topUser = Array.from(perUser.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;

    return {
      month_start: monthStart.toISOString(),
      total_cost_brl_today: totalCostBrlToday,
      total_cost_brl_month: totalCostBrlMonth,
      total_cost_usd_month: totalCostUsdMonth,
      revenue_brl_month: revenueMonth,
      net_revenue_brl_month: netRevenue,
      margin_brl_month: marginBrl,
      margin_percent: marginPct,
      active_subscribers: activeSubCount,
      avg_cost_per_subscriber_brl:
        activeSubCount > 0 ? totalCostBrlMonth / activeSubCount : 0,
      cost_percent_of_revenue: revenueMonth > 0 ? (totalCostBrlMonth / revenueMonth) * 100 : 0,
      input_audio_tokens_month: inAudio,
      output_audio_tokens_month: outAudio,
      top_user_id: topUser?.[0] ?? null,
      top_user_cost_brl: topUser?.[1] ?? 0,
      daily_cost_brl: daily,
      finance: {
        usd_brl_rate: Number(finance.usd_brl_rate ?? 0),
        mercado_pago_fee_percent: Number(finance.mercado_pago_fee_percent ?? 0),
        monthly_fixed_cost_brl: Number(finance.monthly_fixed_cost_brl ?? 0),
        tax_percent: Number(finance.tax_percent ?? 0),
        alert_cost_per_user_brl: Number(finance.alert_cost_per_user_brl ?? 0),
        alert_cost_percent_of_revenue: Number(finance.alert_cost_percent_of_revenue ?? 0),
      },
      monthly_price_brl: MONTHLY_PRICE_BRL,
    };
  });

export type AiCostUserRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  status: string | null;
  minutes_used: number;
  conversations_count: number;
  model: string | null;
  input_audio_tokens: number;
  output_audio_tokens: number;
  estimated_cost_usd: number;
  estimated_cost_brl: number;
  revenue_brl: number;
  margin_brl: number;
  margin_percent: number;
};

export const listAiCostByUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; limit?: number; model?: string; onlyActive?: boolean }) => input)
  .handler(async ({ data, context }): Promise<AiCostUserRow[]> => {
    await ensureAdmin(context);
    const limit = Math.min(Math.max(Number(data.limit ?? 200), 1), 500);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          gte: (c: string, v: string) => Promise<{ data: unknown[] | null }>;
        };
      };
    };

    const [eventsRes, subsRes, profilesRes, financeRes] = await Promise.all([
      admin
        .from("ai_usage_events")
        .select("user_id, model, input_audio_tokens, output_audio_tokens, estimated_cost_usd, estimated_cost_brl, conversation_id")
        .gte("occurred_at", monthStart.toISOString()),
      (context.supabase as unknown as { from: (t: string) => { select: (s: string) => Promise<{ data: unknown[] | null }> } })
        .from("subscriptions")
        .select("user_id, status, minutes_used"),
      (context.supabase as unknown as { from: (t: string) => { select: (s: string) => Promise<{ data: unknown[] | null }> } })
        .from("profiles")
        .select("id, name, email"),
      (context.supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (c: string, v: number) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } } } })
        .from("finance_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    const events = (eventsRes.data ?? []) as Array<{
      user_id: string; model: string;
      input_audio_tokens: number; output_audio_tokens: number;
      estimated_cost_usd: number; estimated_cost_brl: number;
      conversation_id: string | null;
    }>;
    const subs = (subsRes.data ?? []) as Array<{ user_id: string; status: string; minutes_used: number }>;
    const profiles = (profilesRes.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>;
    const finance = (financeRes.data ?? {}) as Record<string, unknown>;
    const feePct = Number(finance.mercado_pago_fee_percent ?? 0);
    const taxPct = Number(finance.tax_percent ?? 0);

    const byUser = new Map<string, AiCostUserRow>();
    for (const e of events) {
      const cur = byUser.get(e.user_id) ?? {
        user_id: e.user_id,
        name: null,
        email: null,
        status: null,
        minutes_used: 0,
        conversations_count: 0,
        model: null,
        input_audio_tokens: 0,
        output_audio_tokens: 0,
        estimated_cost_usd: 0,
        estimated_cost_brl: 0,
        revenue_brl: 0,
        margin_brl: 0,
        margin_percent: 0,
      };
      cur.input_audio_tokens += Number(e.input_audio_tokens ?? 0);
      cur.output_audio_tokens += Number(e.output_audio_tokens ?? 0);
      cur.estimated_cost_usd += Number(e.estimated_cost_usd ?? 0);
      cur.estimated_cost_brl += Number(e.estimated_cost_brl ?? 0);
      cur.model = e.model;
      byUser.set(e.user_id, cur);
    }
    // Distinct conversations per user
    const convByUser = new Map<string, Set<string>>();
    for (const e of events) {
      if (!e.conversation_id) continue;
      const s = convByUser.get(e.user_id) ?? new Set<string>();
      s.add(e.conversation_id);
      convByUser.set(e.user_id, s);
    }
    for (const [uid, set] of convByUser) {
      const r = byUser.get(uid);
      if (r) r.conversations_count = set.size;
    }
    // Merge subs + profiles + revenue
    const subByUser = new Map(subs.map((s) => [s.user_id, s]));
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    // Include active subscribers even with zero events
    for (const s of subs) {
      if (!byUser.has(s.user_id) && ["authorized", "active"].includes(s.status)) {
        byUser.set(s.user_id, {
          user_id: s.user_id,
          name: null,
          email: null,
          status: null,
          minutes_used: 0,
          conversations_count: 0,
          model: null,
          input_audio_tokens: 0,
          output_audio_tokens: 0,
          estimated_cost_usd: 0,
          estimated_cost_brl: 0,
          revenue_brl: 0,
          margin_brl: 0,
          margin_percent: 0,
        });
      }
    }

    const rows: AiCostUserRow[] = [];
    for (const [uid, r] of byUser) {
      const sub = subByUser.get(uid);
      const prof = profileById.get(uid);
      r.name = prof?.name ?? null;
      r.email = prof?.email ?? null;
      r.status = sub?.status ?? null;
      r.minutes_used = Number(sub?.minutes_used ?? 0);
      const isActive = sub && ["authorized", "active"].includes(sub.status);
      r.revenue_brl = isActive ? MONTHLY_PRICE_BRL : 0;
      const netRev = r.revenue_brl * (1 - feePct / 100 - taxPct / 100);
      r.margin_brl = netRev - r.estimated_cost_brl;
      r.margin_percent = netRev > 0 ? (r.margin_brl / netRev) * 100 : 0;
      rows.push(r);
    }

    // Filters
    let out = rows;
    if (data.model) out = out.filter((r) => r.model === data.model);
    if (data.onlyActive) out = out.filter((r) => r.status && ["authorized", "active"].includes(r.status));
    if (data.search) {
      const q = data.search.toLowerCase();
      out = out.filter(
        (r) => (r.name ?? "").toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q),
      );
    }
    out.sort((a, b) => b.estimated_cost_brl - a.estimated_cost_brl);
    return out.slice(0, limit);
  });

const FinanceSchema = z.object({
  usd_brl_rate: z.number().positive().max(100),
  mercado_pago_fee_percent: z.number().min(0).max(30),
  monthly_fixed_cost_brl: z.number().min(0).max(1_000_000),
  tax_percent: z.number().min(0).max(50),
  alert_cost_per_user_brl: z.number().min(0).max(10_000),
  alert_cost_percent_of_revenue: z.number().min(0).max(100),
});

export const updateFinanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof FinanceSchema>) => FinanceSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any)
      .from("finance_settings")
      .update({ ...data, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", 1);
    return { ok: true };
  });

export type AiPricingRow = {
  id: string;
  provider: string;
  model: string;
  input_text_per_million_usd: number;
  cached_input_text_per_million_usd: number;
  output_text_per_million_usd: number;
  input_audio_per_million_usd: number;
  cached_input_audio_per_million_usd: number;
  output_audio_per_million_usd: number;
  effective_from: string;
  effective_until: string | null;
  source_url: string | null;
};

export const listAiPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiPricingRow[]> => {
    await ensureAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (context.supabase as any)
      .from("ai_model_pricing")
      .select("*")
      .order("effective_from", { ascending: false });
    return (data ?? []) as AiPricingRow[];
  });

const PricingUpdateSchema = z.object({
  id: z.string().uuid().optional(),
  provider: z.string().min(1).max(40).default("openai"),
  model: z.string().min(1).max(80),
  input_text_per_million_usd: z.number().min(0).max(10_000),
  cached_input_text_per_million_usd: z.number().min(0).max(10_000),
  output_text_per_million_usd: z.number().min(0).max(10_000),
  input_audio_per_million_usd: z.number().min(0).max(10_000),
  cached_input_audio_per_million_usd: z.number().min(0).max(10_000),
  output_audio_per_million_usd: z.number().min(0).max(10_000),
  effective_from: z.string().datetime().optional(),
  effective_until: z.string().datetime().nullable().optional(),
  source_url: z.string().url().max(500).nullable().optional(),
});

export const upsertAiPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof PricingUpdateSchema>) => PricingUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    if (data.id) {
      await admin.from("ai_model_pricing").update(data).eq("id", data.id);
    } else {
      await admin.from("ai_model_pricing").insert(data);
    }
    return { ok: true };
  });
