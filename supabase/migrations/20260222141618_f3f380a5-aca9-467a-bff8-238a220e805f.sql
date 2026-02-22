
-- =============================================================================
-- FASE 4: Monitoramento Preventivo
-- =============================================================================

-- 1. Enhance maintenance to auto-close orphan tasks
CREATE OR REPLACE FUNCTION public.run_maintenance_v2(
  p_expire_limit integer DEFAULT 500, 
  p_archive_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count int := 0;
  v_archived_count int := 0;
  v_cleaned_count int := 0;
  v_orphan_tasks_count int := 0;
  v_stale_crons_count int := 0;
  v_now timestamptz := now();
  v_thirty_days_ago timestamptz := now() - interval '30 days';
BEGIN
  -- 1) Expire jobs past TTL → mark as 'cancelled'
  WITH expired AS (
    UPDATE jobs
    SET status = 'cancelled'
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status IN ('pending', 'queued')
        AND expires_at < v_now
      LIMIT p_expire_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  )
  SELECT count(*) INTO v_expired_count FROM expired;

  -- 1b) Handle delivered jobs past TTL → mark as 'failed'
  WITH expired_delivered AS (
    UPDATE jobs
    SET status = 'failed'
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status = 'delivered'
        AND expires_at < v_now
      LIMIT p_expire_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  )
  SELECT v_expired_count + count(*) INTO v_expired_count FROM expired_delivered;

  -- 2) Archive old executions (>30 days)
  WITH archived AS (
    UPDATE job_executions
    SET archived_at = v_now
    WHERE id IN (
      SELECT id FROM job_executions
      WHERE archived_at IS NULL
        AND created_at < v_thirty_days_ago
      LIMIT p_archive_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  )
  SELECT count(*) INTO v_archived_count FROM archived;

  -- 3) Clean stale force_update flags
  WITH stale AS (
    UPDATE agents a
    SET force_update_version = NULL,
        force_update_reason = NULL,
        force_update_delivered_count = 0,
        force_update_first_delivered_at = NULL
    WHERE a.force_update_version IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM agent_releases ar
        WHERE ar.version = a.force_update_version
          AND ar.is_active = true
      )
    RETURNING a.id
  )
  SELECT count(*) INTO v_cleaned_count FROM stale;

  -- 4) ZERO-GAP: Auto-resolve orphan tasks older than 24h
  WITH orphans AS (
    UPDATE tasks
    SET status = 'resolved', updated_at = v_now
    WHERE assigned_to IS NULL
      AND status NOT IN ('completed', 'cancelled', 'resolved')
      AND created_at < v_now - interval '24 hours'
    RETURNING id
  )
  SELECT count(*) INTO v_orphan_tasks_count FROM orphans;

  -- 5) ZERO-GAP: Detect stale crons (>4h without success) and create alerts
  SELECT COUNT(*) INTO v_stale_crons_count
  FROM cron_health
  WHERE last_success_at < v_now - interval '4 hours'
    AND consecutive_failures = 0; -- Silent failure (not failing, just not running)

  IF v_stale_crons_count > 0 THEN
    INSERT INTO system_alerts (tenant_id, severity, title, message, source)
    SELECT DISTINCT ur.tenant_id, 'critical',
      'Cron Silencioso Detectado',
      format('Cron "%s" não executou com sucesso nas últimas 4 horas', ch.cron_name),
      'zero-gap-monitor'
    FROM cron_health ch
    CROSS JOIN (SELECT DISTINCT tenant_id FROM user_roles WHERE role = 'admin' LIMIT 1) ur
    WHERE ch.last_success_at < v_now - interval '4 hours'
      AND ch.consecutive_failures = 0
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'expired_jobs', v_expired_count,
    'archived_executions', v_archived_count,
    'stale_flags_cleaned', v_cleaned_count,
    'orphan_tasks_resolved', v_orphan_tasks_count,
    'stale_crons_detected', v_stale_crons_count
  );
END;
$$;

-- 2. Create a view for Zero-Gap health monitoring dashboard
CREATE OR REPLACE VIEW public.v_zero_gap_dashboard AS
WITH orphan_tasks AS (
  SELECT COUNT(*) as cnt FROM tasks 
  WHERE assigned_to IS NULL AND status NOT IN ('completed','cancelled','resolved')
),
zombie_jobs AS (
  SELECT COUNT(*) as cnt FROM jobs 
  WHERE status IN ('pending','in_progress','queued') AND created_at < now() - interval '4 hours'
),
stale_crons AS (
  SELECT COUNT(*) as cnt FROM cron_health
  WHERE last_success_at < now() - interval '4 hours'
),
secured_views AS (
  SELECT COUNT(*) as cnt FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND c.reloptions::text LIKE '%security_invoker=on%'
),
total_views AS (
  SELECT COUNT(*) as cnt FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
),
failed_no_error AS (
  SELECT COUNT(*) as cnt FROM jobs WHERE status = 'failed' AND error_message IS NULL
)
SELECT 
  ot.cnt as orphan_tasks,
  zj.cnt as zombie_jobs,
  sc.cnt as stale_crons,
  sv.cnt as secured_views,
  tv.cnt as total_views,
  ROUND((sv.cnt::numeric / NULLIF(tv.cnt, 0)) * 100, 1) as view_security_coverage_pct,
  fe.cnt as failed_jobs_no_error,
  CASE
    WHEN zj.cnt > 0 OR sc.cnt > 0 OR fe.cnt > 5 THEN 'CRITICAL'
    WHEN ot.cnt > 10 THEN 'WARNING'
    ELSE 'HEALTHY'
  END as system_status,
  now() as checked_at
FROM orphan_tasks ot, zombie_jobs zj, stale_crons sc, secured_views sv, total_views tv, failed_no_error fe;

ALTER VIEW public.v_zero_gap_dashboard SET (security_invoker = on);

COMMENT ON VIEW public.v_zero_gap_dashboard IS 
  'Zero-Gap: Dashboard de monitoramento de integridade sistêmica. Monitora tasks órfãs, jobs zumbis, crons stale, cobertura de security_invoker e falhas silenciosas.';
