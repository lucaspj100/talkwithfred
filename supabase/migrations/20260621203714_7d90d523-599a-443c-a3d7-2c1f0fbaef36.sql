
CREATE TYPE public.learning_item_kind AS ENUM ('error', 'vocabulary', 'phrase');

CREATE TABLE public.learning_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  kind public.learning_item_kind NOT NULL,
  original TEXT NOT NULL,
  correction TEXT,
  explanation_pt TEXT,
  times_practiced INT NOT NULL DEFAULT 0,
  mastered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX learning_items_user_kind_idx ON public.learning_items(user_id, kind, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_items TO authenticated;
GRANT ALL ON public.learning_items TO service_role;
ALTER TABLE public.learning_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own learning items select" ON public.learning_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own learning items insert" ON public.learning_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own learning items update" ON public.learning_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own learning items delete" ON public.learning_items FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER learning_items_touch BEFORE UPDATE ON public.learning_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.user_stats (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp INT NOT NULL DEFAULT 0,
  streak_days INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_practice_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_stats TO authenticated;
GRANT ALL ON public.user_stats TO service_role;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stats select" ON public.user_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own stats insert" ON public.user_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own stats update" ON public.user_stats FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_stats_touch BEFORE UPDATE ON public.user_stats FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.practice_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity TEXT NOT NULL,
  items_total INT NOT NULL DEFAULT 0,
  items_correct INT NOT NULL DEFAULT 0,
  xp_earned INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX practice_sessions_user_idx ON public.practice_sessions(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.practice_sessions TO authenticated;
GRANT ALL ON public.practice_sessions TO service_role;
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions select" ON public.practice_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own sessions insert" ON public.practice_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
