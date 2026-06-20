
-- Lock down user_roles: only admins can mutate (prevents privilege escalation)
CREATE POLICY "Admins manage roles insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Restrict UPDATE/DELETE on messages to the owning user
CREATE POLICY "messages own update" ON public.messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "messages own delete" ON public.messages
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
