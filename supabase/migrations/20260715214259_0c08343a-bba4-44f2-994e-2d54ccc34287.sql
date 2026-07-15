-- Rename lucas_avatar_url → fred_avatar_url on app_settings, preserving the value.
ALTER TABLE public.app_settings RENAME COLUMN lucas_avatar_url TO fred_avatar_url;

-- Update the singleton row's brand name to "Talk With Fred".
UPDATE public.app_settings
SET brand_name = 'Talk With Fred', updated_at = now()
WHERE singleton = true;