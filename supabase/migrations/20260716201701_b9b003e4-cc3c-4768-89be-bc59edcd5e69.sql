-- =======================================================
-- SUBSCRIPTIONS
-- =======================================================
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mercado_pago',
  provider_subscription_id text UNIQUE,
  provider_plan_id text,
  payer_email text,
  status text NOT NULL DEFAULT 'pending',
  plan_name text NOT NULL DEFAULT 'Talk With Fred',
  monthly_minutes integer NOT NULL DEFAULT 120,
  minutes_used numeric NOT NULL DEFAULT 0,
  minutes_available numeric NOT NULL DEFAULT 120,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_payment_date timestamptz,
  last_payment_status text,
  last_payment_at timestamptz,
  last_renewed_payment_id text,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX subscriptions_provider_sub_idx ON public.subscriptions(provider_subscription_id);
-- Only one "main" (non-terminated) subscription per user
CREATE UNIQUE INDEX subscriptions_user_active_unique
  ON public.subscriptions(user_id)
  WHERE status IN ('pending','authorized','active','paused','payment_required','past_due');

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =======================================================
-- SUBSCRIPTION EVENTS (webhook audit / idempotency)
-- =======================================================
CREATE TABLE public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  provider_subscription_id text,
  event_type text,
  provider_status text,
  provider_event_id text,
  payload jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscription_events_sub_idx ON public.subscription_events(provider_subscription_id);
CREATE UNIQUE INDEX subscription_events_provider_event_uniq
  ON public.subscription_events(provider_event_id)
  WHERE provider_event_id IS NOT NULL;

GRANT SELECT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read subscription events"
  ON public.subscription_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =======================================================
-- USAGE SESSIONS
-- =======================================================
CREATE TABLE public.usage_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  seconds_used integer NOT NULL DEFAULT 0,
  minutes_used numeric NOT NULL DEFAULT 0,
  last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX usage_sessions_user_idx ON public.usage_sessions(user_id);
CREATE INDEX usage_sessions_conversation_idx ON public.usage_sessions(conversation_id);

GRANT SELECT ON public.usage_sessions TO authenticated;
GRANT ALL ON public.usage_sessions TO service_role;

ALTER TABLE public.usage_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage sessions"
  ON public.usage_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all usage sessions"
  ON public.usage_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));