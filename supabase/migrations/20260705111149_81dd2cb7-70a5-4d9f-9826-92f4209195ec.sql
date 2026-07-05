ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS areas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS other_area text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'simulacao';

CREATE POLICY "Admins can update leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
