
-- Fase 2 — controle real dos 120 minutos.
-- Extend usage_sessions com campos necessários para heartbeat/abandonment/proteção.
ALTER TABLE public.usage_sessions
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_token_hash text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS close_reason text,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'voice',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Only one active session per user at a time.
CREATE UNIQUE INDEX IF NOT EXISTS usage_sessions_one_active_per_user
  ON public.usage_sessions(user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS usage_sessions_status_hb_idx
  ON public.usage_sessions(status, last_heartbeat_at);

DROP TRIGGER IF EXISTS usage_sessions_touch_updated_at ON public.usage_sessions;
CREATE TRIGGER usage_sessions_touch_updated_at
  BEFORE UPDATE ON public.usage_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Sanidade: seconds_used never negative, minutes columns tracked in numeric.
ALTER TABLE public.usage_sessions
  DROP CONSTRAINT IF EXISTS usage_sessions_seconds_used_nonneg;
ALTER TABLE public.usage_sessions
  ADD CONSTRAINT usage_sessions_seconds_used_nonneg CHECK (seconds_used >= 0);
