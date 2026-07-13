import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function ensureAdmin(ctx: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
}) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export type EngagementStatus =
  | "very_active"
  | "active"
  | "at_risk"
  | "inactive"
  | "never_activated";

export type UserRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  last_login: string | null;
  onboarding_completed: boolean;
  english_level: string | null;
  main_goal: string | null;
  last_activity_at: string | null;
  conversations_count: number;
  messages_count: number;
  practice_sessions_count: number;
  voice_minutes_total: number;
  learning_items_count: number;
  mastered_items_count: number;
  xp: number;
  streak_days: number;
  longest_streak: number;
  convs_7d: number;
  practice_7d: number;
  engagement_status: EngagementStatus;
};

const dateRange = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const getAdminMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => dateRange.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: res, error } = await (context.supabase as any).rpc(
      "get_admin_dashboard_metrics",
      { start_date: data.start, end_date: data.end },
    );
    if (error) throw new Error(error.message);
    return res as Record<string, unknown>;
  });

export const getAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any).rpc(
      "admin_user_engagement_summary",
    );
    if (error) throw new Error(error.message);
    return (data ?? []) as UserRow[];
  });

export const getAdminRetention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any).rpc(
      "get_admin_retention_metrics",
    );
    if (error) throw new Error(error.message);
    return data as Record<string, number>;
  });

export const getAdminUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const [
      { data: profile },
      { data: userProfile },
      { data: stats },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { data: activity },
    ] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      context.supabase.from("user_profiles").select("*").eq("user_id", data.userId).maybeSingle(),
      context.supabase.from("user_stats").select("*").eq("user_id", data.userId).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (context.supabase as any).rpc("get_admin_user_activity", { target_user: data.userId, max_items: 100 }),
    ]);

    const nowIso = new Date().toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const [
      { count: totalConvs },
      { count: convs7 },
      { count: convs30 },
      { count: msgs },
      { count: prac },
      { data: voiceRows },
    ] = await Promise.all([
      context.supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", data.userId),
      context.supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", data.userId).gte("created_at", sevenDaysAgo),
      context.supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", data.userId).gte("created_at", thirtyDaysAgo),
      context.supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", data.userId).eq("role", "user"),
      context.supabase.from("practice_sessions").select("id", { count: "exact", head: true }).eq("user_id", data.userId),
      context.supabase.from("usage_logs").select("voice_minutes_used").eq("user_id", data.userId),
    ]);

    const voiceMin = (voiceRows ?? []).reduce(
      (acc, r) => acc + Number(r.voice_minutes_used ?? 0),
      0,
    );

    return {
      profile,
      userProfile,
      stats,
      totals: {
        conversations: totalConvs ?? 0,
        conversations_7d: convs7 ?? 0,
        conversations_30d: convs30 ?? 0,
        messages: msgs ?? 0,
        practice_sessions: prac ?? 0,
        voice_minutes: voiceMin,
      },
      activity: (activity ?? []) as Array<{ kind: string; ts: string; meta: Record<string, unknown> }>,
      now: nowIso,
    };
  });

// Legacy — keep for existing /admin.leads route
export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any).rpc(
      "admin_user_engagement_summary",
    );
    if (error) throw new Error(error.message);
    return ((data ?? []) as UserRow[]).map((u) => ({
      id: u.user_id,
      name: u.name,
      email: u.email,
      created_at: u.created_at,
      last_login: u.last_activity_at,
      english_level: u.english_level,
      main_goal: u.main_goal,
      biggest_difficulty: null,
      messages_sent: u.messages_count,
    }));
  });
