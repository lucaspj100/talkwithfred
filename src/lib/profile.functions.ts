import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const profileSchema = z.object({
  english_level: z.enum(["beginner", "basic", "intermediate", "advanced"]),
  main_goal: z.string().min(1).max(80),
  biggest_difficulty: z.string().min(1).max(80),
  correction_preference: z.enum(["always", "sometimes", "ask"]),
  speaking_speed_preference: z.enum(["slow", "normal", "fast"]),
  explanation_language: z.enum(["portuguese", "english", "mixed"]),
  specific_training_situation: z.string().max(200).optional().nullable(),
});

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profile }, { data: userProfile }, { data: roles }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_profiles").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    return {
      profile,
      userProfile,
      isAdmin: (roles ?? []).some((r) => r.role === "admin"),
    };
  });

export const saveOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_profiles").upsert(
      { ...data, user_id: context.userId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateLastLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from("profiles")
      .update({ last_login: new Date().toISOString() })
      .eq("id", context.userId);
    return { ok: true };
  });
