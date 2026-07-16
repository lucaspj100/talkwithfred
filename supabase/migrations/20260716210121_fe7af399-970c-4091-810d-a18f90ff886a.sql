UPDATE public.subscriptions SET
  provider_subscription_id = '00eac27e14eb40e38e8d7930cd99d7a3',
  status = 'authorized',
  next_payment_date = '2026-08-16T20:56:29Z',
  last_payment_at = '2026-07-16T20:58:07Z',
  last_payment_status = 'approved',
  current_period_start = now(),
  current_period_end = '2026-08-16T20:56:29Z',
  monthly_minutes = 120,
  minutes_used = 0,
  minutes_available = 120,
  updated_at = now()
WHERE user_id = '5e458d6a-c84a-488d-8e72-17b3b3108295'
  AND status = 'pending';