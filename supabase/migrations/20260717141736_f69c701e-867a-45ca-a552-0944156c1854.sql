
ALTER TABLE public.conversation_review_items
  ADD COLUMN IF NOT EXISTS exercise_prompt text,
  ADD COLUMN IF NOT EXISTS exercise_instructions text,
  ADD COLUMN IF NOT EXISTS exercise_options jsonb,
  ADD COLUMN IF NOT EXISTS correct_answer text,
  ADD COLUMN IF NOT EXISTS acceptable_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS second_exercise_prompt text,
  ADD COLUMN IF NOT EXISTS second_exercise_type text,
  ADD COLUMN IF NOT EXISTS second_exercise_options jsonb,
  ADD COLUMN IF NOT EXISTS second_correct_answer text,
  ADD COLUMN IF NOT EXISTS second_acceptable_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS user_answer_first text,
  ADD COLUMN IF NOT EXISTS user_answer_second text,
  ADD COLUMN IF NOT EXISTS attempts_first integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts_second integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'understand',
  ADD COLUMN IF NOT EXISTS exercise_generated_at timestamptz;

DO $$ BEGIN
  BEGIN
    ALTER TABLE public.conversation_review_items
      ADD CONSTRAINT conversation_review_items_stage_check
      CHECK (stage IN ('understand','practice','apply','done'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
