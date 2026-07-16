
-- learning_items
DROP POLICY IF EXISTS "own learning items delete" ON public.learning_items;
DROP POLICY IF EXISTS "own learning items insert" ON public.learning_items;
DROP POLICY IF EXISTS "own learning items select" ON public.learning_items;
DROP POLICY IF EXISTS "own learning items update" ON public.learning_items;
CREATE POLICY "own learning items select" ON public.learning_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own learning items insert" ON public.learning_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own learning items update" ON public.learning_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own learning items delete" ON public.learning_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- practice_sessions
DROP POLICY IF EXISTS "own sessions insert" ON public.practice_sessions;
DROP POLICY IF EXISTS "own sessions select" ON public.practice_sessions;
CREATE POLICY "own sessions select" ON public.practice_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own sessions insert" ON public.practice_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- user_stats
DROP POLICY IF EXISTS "own stats insert" ON public.user_stats;
DROP POLICY IF EXISTS "own stats select" ON public.user_stats;
DROP POLICY IF EXISTS "own stats update" ON public.user_stats;
CREATE POLICY "own stats select" ON public.user_stats FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own stats insert" ON public.user_stats FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own stats update" ON public.user_stats FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
