
-- Extend learning_items with spaced repetition fields
ALTER TABLE public.learning_items
  ADD COLUMN IF NOT EXISTS mastery_level SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incorrect_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_practiced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS learning_items_user_next_review_idx
  ON public.learning_items(user_id, next_review_at) WHERE active = true;

-- daily_training_sessions
CREATE TABLE IF NOT EXISTS public.daily_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  training_date DATE NOT NULL,
  is_extra BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ready',
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  correct_items INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER NOT NULL DEFAULT 5,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_training_sessions_status_chk CHECK (status IN ('ready','in_progress','completed'))
);

-- One main training per user per day (extras allowed)
CREATE UNIQUE INDEX IF NOT EXISTS daily_training_sessions_user_date_main_uidx
  ON public.daily_training_sessions(user_id, training_date)
  WHERE is_extra = false;

CREATE INDEX IF NOT EXISTS daily_training_sessions_user_created_idx
  ON public.daily_training_sessions(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_training_sessions TO authenticated;
GRANT ALL ON public.daily_training_sessions TO service_role;
ALTER TABLE public.daily_training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_sessions_own_select" ON public.daily_training_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "training_sessions_own_insert" ON public.daily_training_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "training_sessions_own_update" ON public.daily_training_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "training_sessions_own_delete" ON public.daily_training_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_daily_training_sessions_touch
  BEFORE UPDATE ON public.daily_training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- daily_training_items
CREATE TABLE IF NOT EXISTS public.daily_training_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.daily_training_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID,
  exercise_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  instructions TEXT,
  options JSONB,
  correct_answer TEXT,
  acceptable_answers JSONB,
  explanation_pt TEXT,
  translation_pt TEXT,
  hint TEXT,
  user_answer TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  score NUMERIC(4,2),
  completed BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT dti_source_type_chk CHECK (source_type IN ('conversation_review_item','learning_error','vocabulary','phrase','general_practice')),
  CONSTRAINT dti_exercise_type_chk CHECK (exercise_type IN ('fill_blank','order_words','translate','natural_choice','open_response','vocab_choice','fix_error'))
);

CREATE INDEX IF NOT EXISTS daily_training_items_session_order_idx
  ON public.daily_training_items(session_id, display_order);
CREATE INDEX IF NOT EXISTS daily_training_items_user_idx
  ON public.daily_training_items(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_training_items TO authenticated;
GRANT ALL ON public.daily_training_items TO service_role;
ALTER TABLE public.daily_training_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_items_own_select" ON public.daily_training_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "training_items_own_insert" ON public.daily_training_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "training_items_own_update" ON public.daily_training_items
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "training_items_own_delete" ON public.daily_training_items
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
