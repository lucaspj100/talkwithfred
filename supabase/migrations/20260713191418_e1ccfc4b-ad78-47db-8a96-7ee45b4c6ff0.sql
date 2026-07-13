
-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_last_login ON public.profiles(last_login);
CREATE INDEX IF NOT EXISTS idx_conversations_user_created ON public.conversations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON public.conversations(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON public.messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_practice_user_created ON public.practice_sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_user_created ON public.usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_learning_user_created ON public.learning_items(user_id, created_at);

-- Per-user engagement summary (admin only)
CREATE OR REPLACE FUNCTION public.admin_user_engagement_summary()
RETURNS TABLE (
  user_id uuid,
  name text,
  email text,
  created_at timestamptz,
  last_login timestamptz,
  onboarding_completed boolean,
  english_level text,
  main_goal text,
  last_activity_at timestamptz,
  conversations_count bigint,
  messages_count bigint,
  practice_sessions_count bigint,
  voice_minutes_total numeric,
  learning_items_count bigint,
  mastered_items_count bigint,
  xp integer,
  streak_days integer,
  longest_streak integer,
  convs_7d bigint,
  practice_7d bigint,
  engagement_status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  WITH
    cc AS (SELECT c.user_id AS uid, count(*) AS n, max(c.updated_at) AS max_upd, max(c.created_at) AS max_cre FROM conversations c GROUP BY c.user_id),
    mm AS (SELECT m.user_id AS uid, count(*) FILTER (WHERE m.role='user') AS n, max(m.created_at) AS max_cre FROM messages m GROUP BY m.user_id),
    pp AS (SELECT ps.user_id AS uid, count(*) AS n, max(ps.created_at) AS max_cre FROM practice_sessions ps GROUP BY ps.user_id),
    uu AS (SELECT u.user_id AS uid, coalesce(sum(u.voice_minutes_used),0) AS vmin, max(u.created_at) AS max_cre FROM usage_logs u GROUP BY u.user_id),
    ll AS (SELECT l.user_id AS uid, count(*) AS n, count(*) FILTER (WHERE l.mastered_at IS NOT NULL) AS mastered, max(l.updated_at) AS max_upd, max(l.created_at) AS max_cre FROM learning_items l GROUP BY l.user_id),
    cc7 AS (SELECT c.user_id AS uid, count(*) AS n FROM conversations c WHERE c.updated_at > now() - interval '7 days' GROUP BY c.user_id),
    pp7 AS (SELECT ps.user_id AS uid, count(*) AS n FROM practice_sessions ps WHERE ps.created_at > now() - interval '7 days' GROUP BY ps.user_id)
  SELECT
    p.id,
    p.name,
    p.email,
    p.created_at,
    p.last_login,
    coalesce(up.onboarding_completed, false),
    up.english_level,
    up.main_goal,
    GREATEST(
      p.last_login,
      cc.max_upd, cc.max_cre,
      mm.max_cre,
      pp.max_cre,
      uu.max_cre,
      ll.max_upd, ll.max_cre
    ) AS last_act,
    coalesce(cc.n, 0),
    coalesce(mm.n, 0),
    coalesce(pp.n, 0),
    coalesce(uu.vmin, 0),
    coalesce(ll.n, 0),
    coalesce(ll.mastered, 0),
    coalesce(us.xp, 0),
    coalesce(us.streak_days, 0),
    coalesce(us.longest_streak, 0),
    coalesce(cc7.n, 0),
    coalesce(pp7.n, 0),
    CASE
      WHEN coalesce(cc.n,0)=0 AND coalesce(mm.n,0)=0 AND coalesce(pp.n,0)=0 AND coalesce(uu.vmin,0)=0 AND coalesce(ll.n,0)=0 THEN 'never_activated'
      WHEN GREATEST(p.last_login, cc.max_upd, cc.max_cre, mm.max_cre, pp.max_cre, uu.max_cre, ll.max_upd, ll.max_cre) > now() - interval '3 days'
        AND (coalesce(cc7.n,0) + coalesce(pp7.n,0)) >= 3 THEN 'very_active'
      WHEN GREATEST(p.last_login, cc.max_upd, cc.max_cre, mm.max_cre, pp.max_cre, uu.max_cre, ll.max_upd, ll.max_cre) > now() - interval '7 days' THEN 'active'
      WHEN GREATEST(p.last_login, cc.max_upd, cc.max_cre, mm.max_cre, pp.max_cre, uu.max_cre, ll.max_upd, ll.max_cre) > now() - interval '14 days' THEN 'at_risk'
      ELSE 'inactive'
    END
  FROM profiles p
  LEFT JOIN user_profiles up ON up.user_id = p.id
  LEFT JOIN user_stats us ON us.user_id = p.id
  LEFT JOIN cc ON cc.uid = p.id
  LEFT JOIN mm ON mm.uid = p.id
  LEFT JOIN pp ON pp.uid = p.id
  LEFT JOIN uu ON uu.uid = p.id
  LEFT JOIN ll ON ll.uid = p.id
  LEFT JOIN cc7 ON cc7.uid = p.id
  LEFT JOIN pp7 ON pp7.uid = p.id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_user_engagement_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_user_engagement_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_user_engagement_summary() TO authenticated;

-- Dashboard aggregate metrics (admin only)
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(start_date timestamptz, end_date timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH
  by_day AS (
    SELECT d::date AS day FROM generate_series(start_date::date, end_date::date, interval '1 day') d
  ),
  new_users_by_day AS (
    SELECT d.day, (SELECT count(*) FROM profiles p WHERE p.created_at::date = d.day) AS c FROM by_day d
  ),
  convs_by_day AS (
    SELECT d.day, (SELECT count(*) FROM conversations c WHERE c.created_at::date = d.day) AS c FROM by_day d
  ),
  msgs_by_day AS (
    SELECT d.day, (SELECT count(*) FROM messages m WHERE m.created_at::date = d.day AND m.role='user') AS c FROM by_day d
  ),
  prac_by_day AS (
    SELECT d.day, (SELECT count(*) FROM practice_sessions ps WHERE ps.created_at::date = d.day) AS c FROM by_day d
  ),
  voice_by_day AS (
    SELECT d.day, (SELECT coalesce(sum(voice_minutes_used),0) FROM usage_logs u WHERE u.created_at::date = d.day) AS c FROM by_day d
  ),
  active_by_day AS (
    SELECT d.day, (
      SELECT count(DISTINCT uid) FROM (
        SELECT user_id AS uid FROM conversations WHERE updated_at::date = d.day
        UNION SELECT user_id FROM messages WHERE created_at::date = d.day
        UNION SELECT user_id FROM practice_sessions WHERE created_at::date = d.day
        UNION SELECT user_id FROM usage_logs WHERE created_at::date = d.day
        UNION SELECT user_id FROM learning_items WHERE created_at::date = d.day
      ) x
    ) AS c FROM by_day d
  ),
  active_ids AS (
    SELECT user_id FROM conversations WHERE updated_at BETWEEN start_date AND end_date
    UNION SELECT user_id FROM messages WHERE created_at BETWEEN start_date AND end_date
    UNION SELECT user_id FROM practice_sessions WHERE created_at BETWEEN start_date AND end_date
    UNION SELECT user_id FROM usage_logs WHERE created_at BETWEEN start_date AND end_date
    UNION SELECT user_id FROM learning_items WHERE created_at BETWEEN start_date AND end_date
  ),
  active_today_ids AS (
    SELECT user_id FROM conversations WHERE updated_at > now() - interval '1 day'
    UNION SELECT user_id FROM messages WHERE created_at > now() - interval '1 day'
    UNION SELECT user_id FROM practice_sessions WHERE created_at > now() - interval '1 day'
    UNION SELECT user_id FROM usage_logs WHERE created_at > now() - interval '1 day'
    UNION SELECT user_id FROM learning_items WHERE created_at > now() - interval '1 day'
  ),
  modes AS (
    SELECT coalesce(mode,'unknown') AS label, count(*) AS c
    FROM conversations WHERE created_at BETWEEN start_date AND end_date
    GROUP BY mode
  ),
  levels AS (
    SELECT coalesce(english_level,'unknown') AS label, count(*) AS c
    FROM user_profiles GROUP BY english_level
  )
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM profiles),
    'new_users', (SELECT count(*) FROM profiles WHERE created_at BETWEEN start_date AND end_date),
    'onboarded', (SELECT count(*) FROM user_profiles WHERE onboarding_completed = true),
    'convs', (SELECT count(*) FROM conversations WHERE created_at BETWEEN start_date AND end_date),
    'msgs', (SELECT count(*) FROM messages WHERE created_at BETWEEN start_date AND end_date AND role='user'),
    'practices', (SELECT count(*) FROM practice_sessions WHERE created_at BETWEEN start_date AND end_date),
    'voice_min', (SELECT coalesce(sum(voice_minutes_used),0) FROM usage_logs WHERE created_at BETWEEN start_date AND end_date),
    'active_period', (SELECT count(*) FROM active_ids),
    'active_today', (SELECT count(*) FROM active_today_ids),
    'new_users_by_day', coalesce((SELECT jsonb_agg(jsonb_build_object('day', day, 'value', c) ORDER BY day) FROM new_users_by_day), '[]'::jsonb),
    'active_by_day', coalesce((SELECT jsonb_agg(jsonb_build_object('day', day, 'value', c) ORDER BY day) FROM active_by_day), '[]'::jsonb),
    'convs_by_day', coalesce((SELECT jsonb_agg(jsonb_build_object('day', day, 'value', c) ORDER BY day) FROM convs_by_day), '[]'::jsonb),
    'msgs_by_day', coalesce((SELECT jsonb_agg(jsonb_build_object('day', day, 'value', c) ORDER BY day) FROM msgs_by_day), '[]'::jsonb),
    'prac_by_day', coalesce((SELECT jsonb_agg(jsonb_build_object('day', day, 'value', c) ORDER BY day) FROM prac_by_day), '[]'::jsonb),
    'voice_by_day', coalesce((SELECT jsonb_agg(jsonb_build_object('day', day, 'value', c) ORDER BY day) FROM voice_by_day), '[]'::jsonb),
    'modes', coalesce((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', c)) FROM modes), '[]'::jsonb),
    'levels', coalesce((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', c)) FROM levels), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_metrics(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_metrics(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics(timestamptz, timestamptz) TO authenticated;

-- Retention metrics
CREATE OR REPLACE FUNCTION public.get_admin_retention_metrics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH first_act AS (
    SELECT user_id AS uid, min(ts) AS first_ts FROM (
      SELECT user_id, created_at AS ts FROM conversations
      UNION ALL SELECT user_id, created_at FROM messages
      UNION ALL SELECT user_id, created_at FROM practice_sessions
      UNION ALL SELECT user_id, created_at FROM usage_logs
      UNION ALL SELECT user_id, created_at FROM learning_items
    ) x
    GROUP BY user_id
  ),
  all_act AS (
    SELECT user_id AS uid, ts::date AS day FROM (
      SELECT user_id, created_at AS ts FROM conversations
      UNION ALL SELECT user_id, updated_at FROM conversations
      UNION ALL SELECT user_id, created_at FROM messages
      UNION ALL SELECT user_id, created_at FROM practice_sessions
      UNION ALL SELECT user_id, created_at FROM usage_logs
      UNION ALL SELECT user_id, created_at FROM learning_items
    ) x
  ),
  days_active AS (
    SELECT uid, count(DISTINCT day) AS ndays FROM all_act
    WHERE day > (now() - interval '30 days')::date
    GROUP BY uid
  ),
  session_counts AS (
    SELECT uid, count(DISTINCT day) AS ndays FROM all_act GROUP BY uid
  )
  SELECT jsonb_build_object(
    'd1', (SELECT count(*) FROM first_act f WHERE EXISTS (
        SELECT 1 FROM all_act a WHERE a.uid=f.uid AND a.day > f.first_ts::date AND a.day <= (f.first_ts + interval '1 day')::date)),
    'd7', (SELECT count(*) FROM first_act f WHERE EXISTS (
        SELECT 1 FROM all_act a WHERE a.uid=f.uid AND a.day >= (f.first_ts + interval '7 days')::date AND a.day <= (f.first_ts + interval '13 days')::date)),
    'd14', (SELECT count(*) FROM first_act f WHERE EXISTS (
        SELECT 1 FROM all_act a WHERE a.uid=f.uid AND a.day >= (f.first_ts + interval '14 days')::date AND a.day <= (f.first_ts + interval '20 days')::date)),
    'd30', (SELECT count(*) FROM first_act f WHERE EXISTS (
        SELECT 1 FROM all_act a WHERE a.uid=f.uid AND a.day >= (f.first_ts + interval '30 days')::date)),
    'total_activated', (SELECT count(*) FROM first_act),
    'one_shot', (SELECT count(*) FROM session_counts WHERE ndays = 1),
    'multi', (SELECT count(*) FROM session_counts WHERE ndays >= 2),
    'avg_days_active_30d', coalesce((SELECT round(avg(ndays)::numeric, 2) FROM days_active), 0)
  ) INTO result;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_retention_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_retention_metrics() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_retention_metrics() TO authenticated;

-- Per-user activity timeline for admin detail page
CREATE OR REPLACE FUNCTION public.get_admin_user_activity(target_user uuid, max_items int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH events AS (
    SELECT 'conversation'::text AS kind, c.created_at AS ts, jsonb_build_object('id', c.id, 'mode', c.mode, 'title', c.title) AS meta
    FROM conversations c WHERE c.user_id = target_user
    UNION ALL
    SELECT 'practice', ps.created_at, jsonb_build_object('activity', ps.activity, 'items_total', ps.items_total, 'items_correct', ps.items_correct, 'xp', ps.xp_earned)
    FROM practice_sessions ps WHERE ps.user_id = target_user
    UNION ALL
    SELECT 'usage', u.created_at, jsonb_build_object('action', u.action_type, 'voice_min', u.voice_minutes_used, 'msgs', u.messages_sent)
    FROM usage_logs u WHERE u.user_id = target_user
    UNION ALL
    SELECT 'learning', l.created_at, jsonb_build_object('kind', l.kind, 'mastered', l.mastered_at IS NOT NULL)
    FROM learning_items l WHERE l.user_id = target_user
  )
  SELECT jsonb_agg(jsonb_build_object('kind', kind, 'ts', ts, 'meta', meta) ORDER BY ts DESC)
  INTO result
  FROM (SELECT * FROM events ORDER BY ts DESC LIMIT max_items) e;
  RETURN coalesce(result, '[]'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_user_activity(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_user_activity(uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_activity(uuid, int) TO authenticated;
