import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { correctionToLegacy, levelToLegacy } from "@/lib/onboarding-options";

const stringArray = z.array(z.string().min(1).max(80)).max(40);

const onboardingSchema = z
  .object({
    english_goals: stringArray.min(1, "Selecione ao menos um objetivo"),
    primary_english_goal: z.string().min(1).max(80),
    professional_areas: stringArray,
    primary_professional_area: z.string().min(1).max(80).nullable(),
    custom_professional_area: z.string().max(120).nullable().optional(),
    preferred_situations: stringArray,
    technical_terms: z.array(z.string().min(1).max(60)).max(30),
    english_level: z.enum(["beginner", "basic", "intermediate", "advanced", "unknown"]),
    correction_preference: z.enum(["light", "balanced", "heavy", "after"]),
    practice_goal: z.enum(["5min", "10min", "15min", "3x_week", "flexible"]),
  })
  .refine((d) => d.english_goals.includes(d.primary_english_goal), {
    message: "O objetivo principal precisa estar entre os selecionados",
    path: ["primary_english_goal"],
  })
  .refine(
    (d) =>
      d.professional_areas.length === 0 ||
      d.professional_areas.includes("none") ||
      (d.primary_professional_area && d.professional_areas.includes(d.primary_professional_area)),
    { message: "A área principal precisa estar entre as selecionadas", path: ["primary_professional_area"] },
  );

export type OnboardingPayload = z.infer<typeof onboardingSchema>;

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
  .inputValidator((input: unknown) => onboardingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();

    // Determine whether this is the first time completing
    const { data: existing } = await context.supabase
      .from("user_profiles")
      .select("onboarding_completed, onboarding_completed_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    const payload = {
      user_id: context.userId,
      // new fields
      english_goals: data.english_goals,
      primary_english_goal: data.primary_english_goal,
      professional_areas: data.professional_areas,
      primary_professional_area: data.primary_professional_area,
      custom_professional_area: data.custom_professional_area ?? null,
      preferred_situations: data.preferred_situations,
      technical_terms: data.technical_terms,
      practice_goal: data.practice_goal,
      english_level: levelToLegacy(data.english_level),
      // legacy mirror fields so existing fred-prompt/dashboard keep working
      main_goal: data.primary_english_goal,
      biggest_difficulty: "speaking",
      correction_preference: correctionToLegacy(data.correction_preference),
      speaking_speed_preference: "normal",
      explanation_language: "mixed",
      // bookkeeping
      onboarding_completed: true,
      onboarding_completed_at: existing?.onboarding_completed_at ?? now,
      onboarding_updated_at: now,
      updated_at: now,
    };

    const { error } = await context.supabase
      .from("user_profiles")
      .upsert(payload, { onConflict: "user_id" });
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

const speakingSpeedSchema = z.object({
  speaking_speed_preference: z.enum(["slower", "level_adapted", "natural"]),
});

export const updateSpeakingSpeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => speakingSpeedSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_profiles")
      .update({
        speaking_speed_preference: data.speaking_speed_preference,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
