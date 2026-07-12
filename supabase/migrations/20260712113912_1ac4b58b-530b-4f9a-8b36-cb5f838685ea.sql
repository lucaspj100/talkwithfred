
CREATE POLICY "Admins can insert leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete their own stats" ON public.user_stats
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
