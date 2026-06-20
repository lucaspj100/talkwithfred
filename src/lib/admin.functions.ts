import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdminRows } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!isAdminRows) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles }, { data: userProfiles }, { data: messages }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, email, created_at, last_login"),
      supabaseAdmin.from("user_profiles").select("user_id, english_level, main_goal, biggest_difficulty"),
      supabaseAdmin.from("messages").select("user_id, created_at"),
    ]);

    const byUser = new Map<string, { count: number; last: string | null }>();
    for (const m of messages ?? []) {
      const e = byUser.get(m.user_id) ?? { count: 0, last: null };
      e.count += 1;
      if (!e.last || m.created_at > e.last) e.last = m.created_at;
      byUser.set(m.user_id, e);
    }
    const upMap = new Map((userProfiles ?? []).map((u) => [u.user_id, u]));

    return (profiles ?? []).map((p) => {
      const up = upMap.get(p.id);
      const stats = byUser.get(p.id) ?? { count: 0, last: null };
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        created_at: p.created_at,
        last_login: stats.last ?? p.last_login,
        english_level: up?.english_level ?? null,
        main_goal: up?.main_goal ?? null,
        biggest_difficulty: up?.biggest_difficulty ?? null,
        messages_sent: stats.count,
      };
    });
  });
