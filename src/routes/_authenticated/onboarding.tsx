import { createFileRoute, redirect } from "@tanstack/react-router";
import { getMyProfile } from "@/lib/profile.functions";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const Route = createFileRoute("/_authenticated/onboarding")({
  loader: async () => {
    const data = await getMyProfile();
    // If user already completed the new onboarding, send them to dashboard.
    // Legacy users (onboarding_completed=false but have a profile) still see this flow.
    if (data.userProfile?.onboarding_completed) throw redirect({ to: "/dashboard" });
    return {
      name: data.profile?.name ?? "",
      initial: data.userProfile
        ? {
            english_goals: (data.userProfile.english_goals as string[] | null) ?? [],
            primary_english_goal: data.userProfile.primary_english_goal,
            professional_areas: (data.userProfile.professional_areas as string[] | null) ?? [],
            primary_professional_area: data.userProfile.primary_professional_area,
            custom_professional_area: data.userProfile.custom_professional_area,
            preferred_situations: (data.userProfile.preferred_situations as string[] | null) ?? [],
            technical_terms: (data.userProfile.technical_terms as string[] | null) ?? [],
            english_level: data.userProfile.english_level,
            correction_preference: data.userProfile.correction_preference,
            practice_goal: data.userProfile.practice_goal,
          }
        : undefined,
    };
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const { name, initial } = Route.useLoaderData();
  return <OnboardingFlow userName={name} initial={initial} />;
}
