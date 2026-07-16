-- Audit table for admin/user actions on subscriptions
CREATE TABLE IF NOT EXISTS public.subscription_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NULL REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id uuid NULL,
  actor_user_id uuid NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user','admin','webhook','system')),
  action text NOT NULL,
  previous_data jsonb NULL,
  new_data jsonb NULL,
  reason text NULL,
  provider_reference text NULL,
  ip_address text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_audit_logs_subscription ON public.subscription_audit_logs(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_logs_user ON public.subscription_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_logs_action ON public.subscription_audit_logs(action, created_at DESC);

GRANT SELECT ON public.subscription_audit_logs TO authenticated;
GRANT ALL ON public.subscription_audit_logs TO service_role;

ALTER TABLE public.subscription_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit logs"
ON public.subscription_audit_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own audit logs"
ON public.subscription_audit_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id AND actor_type <> 'admin');

-- Add last_synced_at + cancellation_reason on subscriptions for admin visibility.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text NULL,
  ADD COLUMN IF NOT EXISTS provider_status text NULL;

-- Add rate limit tracker for user-initiated sync (30s minimum interval).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_user_sync_at timestamptz NULL;