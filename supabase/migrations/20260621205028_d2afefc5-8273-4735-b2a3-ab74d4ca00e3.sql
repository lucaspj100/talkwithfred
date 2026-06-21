ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS english_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_english_goal text,
  ADD COLUMN IF NOT EXISTS professional_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_professional_area text,
  ADD COLUMN IF NOT EXISTS custom_professional_area text,
  ADD COLUMN IF NOT EXISTS preferred_situations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS technical_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS practice_goal text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_updated_at timestamptz;

-- Backfill: existing users have legacy main_goal → promote to new fields & mark completed
UPDATE public.user_profiles
SET
  english_goals = CASE
    WHEN jsonb_array_length(english_goals) = 0 AND main_goal IS NOT NULL AND main_goal <> ''
      THEN jsonb_build_array(main_goal)
    ELSE english_goals
  END,
  primary_english_goal = COALESCE(primary_english_goal, NULLIF(main_goal, '')),
  onboarding_completed = true,
  onboarding_completed_at = COALESCE(onboarding_completed_at, created_at)
WHERE main_goal IS NOT NULL AND main_goal <> '';

-- Relax legacy NOT NULL constraints so new onboarding can write only the new fields if needed
ALTER TABLE public.user_profiles
  ALTER COLUMN main_goal DROP NOT NULL,
  ALTER COLUMN biggest_difficulty DROP NOT NULL,
  ALTER COLUMN correction_preference DROP NOT NULL,
  ALTER COLUMN speaking_speed_preference DROP NOT NULL,
  ALTER COLUMN explanation_language DROP NOT NULL,
  ALTER COLUMN english_level DROP NOT NULL;