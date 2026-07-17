
-- ============= conversation_reviews =============
CREATE TABLE public.conversation_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing',
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  analysis_error TEXT,
  title TEXT,
  summary TEXT,
  level_detected TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER NOT NULL DEFAULT 5,
  source TEXT NOT NULL DEFAULT 'auto',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_reviews_conversation_unique UNIQUE (conversation_id),
  CONSTRAINT conversation_reviews_status_check CHECK (status IN ('processing','ready','in_progress','completed','failed','skipped')),
  CONSTRAINT conversation_reviews_analysis_check CHECK (analysis_status IN ('pending','processing','completed','failed'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_reviews TO authenticated;
GRANT ALL ON public.conversation_reviews TO service_role;

ALTER TABLE public.conversation_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own reviews"
  ON public.conversation_reviews FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own reviews"
  ON public.conversation_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own reviews"
  ON public.conversation_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own reviews"
  ON public.conversation_reviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX conversation_reviews_user_status_idx ON public.conversation_reviews(user_id, status, updated_at DESC);
CREATE INDEX conversation_reviews_user_created_idx ON public.conversation_reviews(user_id, created_at DESC);

CREATE TRIGGER conversation_reviews_touch
  BEFORE UPDATE ON public.conversation_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= conversation_review_items =============
CREATE TABLE public.conversation_review_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES public.conversation_reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  category TEXT,
  original_text TEXT,
  corrected_text TEXT,
  natural_text TEXT,
  explanation_pt TEXT,
  translation_pt TEXT,
  context_text TEXT,
  vocabulary JSONB NOT NULL DEFAULT '[]'::jsonb,
  importance TEXT NOT NULL DEFAULT 'medium',
  exercise_type TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  user_answer TEXT,
  score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT conversation_review_items_type_check CHECK (
    type IN ('grammar_error','unnatural_phrase','vocabulary','word_choice','incomplete_answer','pronunciation_note','positive_feedback','general_improvement')
  ),
  CONSTRAINT conversation_review_items_importance_check CHECK (importance IN ('low','medium','high'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_review_items TO authenticated;
GRANT ALL ON public.conversation_review_items TO service_role;

ALTER TABLE public.conversation_review_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own review items"
  ON public.conversation_review_items FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own review items"
  ON public.conversation_review_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own review items"
  ON public.conversation_review_items FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own review items"
  ON public.conversation_review_items FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX conversation_review_items_review_idx ON public.conversation_review_items(review_id, display_order);
CREATE INDEX conversation_review_items_user_idx ON public.conversation_review_items(user_id, created_at DESC);
