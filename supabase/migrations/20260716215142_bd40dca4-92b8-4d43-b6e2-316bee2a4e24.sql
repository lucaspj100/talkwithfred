-- Update column defaults to 90 minutes
ALTER TABLE public.subscriptions ALTER COLUMN monthly_minutes SET DEFAULT 90;
ALTER TABLE public.subscriptions ALTER COLUMN minutes_available SET DEFAULT 90;

-- Recalculate existing subs still on the old 120-minute cap.
-- Idempotent: after this runs the rows are at 90, so re-running is a no-op.
DO $$
DECLARE
  r RECORD;
  new_available numeric;
BEGIN
  FOR r IN
    SELECT id, user_id, monthly_minutes, minutes_used, minutes_available
    FROM public.subscriptions
    WHERE monthly_minutes = 120
  LOOP
    new_available := GREATEST(0, 90 - COALESCE(r.minutes_used, 0));

    UPDATE public.subscriptions
       SET monthly_minutes = 90,
           minutes_available = new_available,
           updated_at = now()
     WHERE id = r.id;

    INSERT INTO public.subscription_audit_logs
      (subscription_id, user_id, actor_type, action, previous_data, new_data, reason)
    VALUES (
      r.id,
      r.user_id,
      'system',
      'monthly_limit_changed',
      jsonb_build_object(
        'monthly_minutes', 120,
        'minutes_available', r.minutes_available,
        'minutes_used', r.minutes_used
      ),
      jsonb_build_object(
        'monthly_minutes', 90,
        'minutes_available', new_available,
        'minutes_used', r.minutes_used
      ),
      'Plano atualizado de 120 para 90 minutos mensais (mesmo preço, ciclo atual preservado).'
    );
  END LOOP;
END $$;