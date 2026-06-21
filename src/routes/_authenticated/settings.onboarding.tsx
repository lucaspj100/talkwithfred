import { createFileRoute, redirect } from "@tanstack/react-router";
import { getMyProfile } from "@/lib/profile.functions";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const Route = createFileRoute("/_authenticated/settings/onboarding")({
  loader: async () => {
    const data = await getMyProfile();
    if (!data.userProfile) throw redirect({ to: "/onboarding" });
    return {
      name: data.profile?.name ?? "",
      initial: {
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
      },
    };
  },
  component: EditFocusPage,
});

function EditFocusPage() {
  const { name, initial } = Route.useLoaderData();
  return <OnboardingFlow userName={name} initial={initial} editMode />;
}
