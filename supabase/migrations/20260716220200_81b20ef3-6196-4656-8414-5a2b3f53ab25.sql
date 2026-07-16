
-- 1. Pricing table
CREATE TABLE public.ai_model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL,
  input_text_per_million_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  cached_input_text_per_million_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  output_text_per_million_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  input_audio_per_million_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  cached_input_audio_per_million_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  output_audio_per_million_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_model_pricing_model_from_idx ON public.ai_model_pricing (model, effective_from DESC);
GRANT SELECT ON public.ai_model_pricing TO authenticated;
GRANT ALL ON public.ai_model_pricing TO service_role;
ALTER TABLE public.ai_model_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view pricing" ON public.ai_model_pricing FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert pricing" ON public.ai_model_pricing FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update pricing" ON public.ai_model_pricing FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete pricing" ON public.ai_model_pricing FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ai_model_pricing_touch BEFORE UPDATE ON public.ai_model_pricing FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Usage events
CREATE TABLE public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_session_id UUID REFERENCES public.usage_sessions(id) ON DELETE SET NULL,
  conversation_id TEXT,
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL,
  provider_response_id TEXT,
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  input_text_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_text_tokens INTEGER NOT NULL DEFAULT 0,
  output_text_tokens INTEGER NOT NULL DEFAULT 0,
  input_audio_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_audio_tokens INTEGER NOT NULL DEFAULT 0,
  output_audio_tokens INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(14,8) NOT NULL DEFAULT 0,
  exchange_rate_brl NUMERIC(12,6),
  estimated_cost_brl NUMERIC(14,8),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_usage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_events_non_negative CHECK (
    input_text_tokens >= 0 AND cached_input_text_tokens >= 0 AND output_text_tokens >= 0
    AND input_audio_tokens >= 0 AND cached_input_audio_tokens >= 0 AND output_audio_tokens >= 0
    AND estimated_cost_usd >= 0
  )
);
CREATE UNIQUE INDEX ai_usage_events_provider_response_unique
  ON public.ai_usage_events (provider, provider_response_id)
  WHERE provider_response_id IS NOT NULL;
CREATE INDEX ai_usage_events_user_idx ON public.ai_usage_events (user_id, occurred_at DESC);
CREATE INDEX ai_usage_events_session_idx ON public.ai_usage_events (usage_session_id);
CREATE INDEX ai_usage_events_conversation_idx ON public.ai_usage_events (conversation_id);
CREATE INDEX ai_usage_events_model_idx ON public.ai_usage_events (model);
CREATE INDEX ai_usage_events_occurred_idx ON public.ai_usage_events (occurred_at);
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
-- Admin-only visibility (users must never see internal costs)
CREATE POLICY "Admins view ai usage" ON public.ai_usage_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
-- No INSERT/UPDATE/DELETE policies: only service_role (server) writes.

-- 3. Finance settings (single-row)
CREATE TABLE public.finance_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  usd_brl_rate NUMERIC(10,4) NOT NULL DEFAULT 5.20,
  mercado_pago_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 4.99,
  monthly_fixed_cost_brl NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  alert_cost_per_user_brl NUMERIC(10,2) NOT NULL DEFAULT 15,
  alert_cost_percent_of_revenue NUMERIC(5,2) NOT NULL DEFAULT 40,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT ON public.finance_settings TO authenticated;
GRANT ALL ON public.finance_settings TO service_role;
ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view finance" ON public.finance_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update finance" ON public.finance_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert finance" ON public.finance_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.finance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 4. usage_sessions: consolidated AI cost columns
ALTER TABLE public.usage_sessions
  ADD COLUMN IF NOT EXISTS ai_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_input_text_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_output_text_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_input_audio_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_output_audio_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_cached_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_estimated_cost_usd NUMERIC(14,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_estimated_cost_brl NUMERIC(14,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_events_count INTEGER NOT NULL DEFAULT 0;

-- 5. Seed official pricing for gpt-realtime (USD per 1M tokens, OpenAI 2025 pricing)
INSERT INTO public.ai_model_pricing
  (provider, model, input_text_per_million_usd, cached_input_text_per_million_usd, output_text_per_million_usd,
   input_audio_per_million_usd, cached_input_audio_per_million_usd, output_audio_per_million_usd, source_url)
VALUES
  ('openai','gpt-realtime',       4, 0.40, 16, 32, 0.40, 64, 'https://openai.com/api/pricing/'),
  ('openai','gpt-realtime-2.1',   4, 0.40, 16, 32, 0.40, 64, 'https://openai.com/api/pricing/'),
  ('openai','whisper-1',          0, 0,    0,  0,  0,    0,  'https://openai.com/api/pricing/');
