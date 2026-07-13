
-- App-wide platform settings (single-row table for brand identity)
CREATE TABLE public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  lucas_avatar_url text,
  brand_name text NOT NULL DEFAULT 'Speak With Lucas',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT app_settings_singleton_check CHECK (singleton = true)
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app settings"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert app settings"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update app settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER app_settings_touch_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed single row
INSERT INTO public.app_settings (singleton, brand_name) VALUES (true, 'Speak With Lucas')
ON CONFLICT (singleton) DO NOTHING;

-- Storage policies for brand-assets bucket (bucket created via storage_create_bucket tool)
CREATE POLICY "Anyone can view brand assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-assets');

CREATE POLICY "Admins can upload brand assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'brand-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update brand assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'brand-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete brand assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'brand-assets' AND public.has_role(auth.uid(), 'admin'));
