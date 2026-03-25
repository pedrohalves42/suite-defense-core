
-- Materialized Views for Dashboard Hot Paths

-- 1. Fleet summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_fleet_summary AS
SELECT
  a.tenant_id,
  COUNT(*) AS total_agents,
  COUNT(*) FILTER (WHERE a.status = 'online') AS online_agents,
  COUNT(*) FILTER (WHERE a.status = 'offline') AS offline_agents,
  COUNT(*) FILTER (WHERE a.is_isolated = true) AS isolated_agents,
  COUNT(DISTINCT a.agent_version) AS distinct_versions,
  now() AS refreshed_at
FROM agents a
WHERE a.archived_at IS NULL
GROUP BY a.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_fleet_summary_tenant ON mv_fleet_summary(tenant_id);

-- 2. Job metrics summary (24h)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_job_metrics_24h AS
SELECT
  j.tenant_id,
  j.type AS job_type,
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE j.status = 'completed') AS success_count,
  COUNT(*) FILTER (WHERE j.status = 'failed') AS failure_count,
  COUNT(*) FILTER (WHERE j.status = 'pending') AS pending_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (j.completed_at - j.created_at)) * 1000)::numeric, 0) AS avg_duration_ms,
  now() AS refreshed_at
FROM jobs j
WHERE j.created_at > now() - interval '24 hours'
GROUP BY j.tenant_id, j.type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_job_metrics_tenant_type ON mv_job_metrics_24h(tenant_id, job_type);

-- 3. Security posture summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_security_posture AS
SELECT
  tenant_id,
  COUNT(*) AS total_scans,
  COUNT(*) FILTER (WHERE remediation_status = 'open') AS open_vulns,
  COUNT(*) FILTER (WHERE severity = 'critical') AS critical_vulns,
  COUNT(*) FILTER (WHERE severity = 'high') AS high_vulns,
  COUNT(*) FILTER (WHERE severity = 'medium') AS medium_vulns,
  COUNT(*) FILTER (WHERE severity = 'low') AS low_vulns,
  now() AS refreshed_at
FROM agent_vulnerability_scans
GROUP BY tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_security_posture_tenant ON mv_security_posture(tenant_id);

-- 4. Alert summary (uses resolved/acknowledged instead of is_active)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_alert_summary AS
SELECT
  tenant_id,
  COUNT(*) FILTER (WHERE resolved = false) AS active_alerts,
  COUNT(*) FILTER (WHERE severity = 'critical' AND resolved = false) AS critical_active,
  COUNT(*) FILTER (WHERE severity = 'high' AND resolved = false) AS high_active,
  COUNT(*) FILTER (WHERE acknowledged = true) AS acknowledged_total,
  COUNT(*) AS total_alerts_24h,
  now() AS refreshed_at
FROM system_alerts
WHERE created_at > now() - interval '24 hours'
GROUP BY tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_alert_summary_tenant ON mv_alert_summary(tenant_id);

-- 5. Refresh function
CREATE OR REPLACE FUNCTION refresh_dashboard_matviews()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fleet_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_job_metrics_24h;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_security_posture;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_alert_summary;
END;
$$;

REVOKE EXECUTE ON FUNCTION refresh_dashboard_matviews() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_dashboard_matviews() TO service_role;

-- Consolidate crons (remove 15 redundant)
SELECT cron.unschedule('cleanup-hmac-signatures')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-hmac-signatures');

SELECT cron.unschedule('cleanup-old-data-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-data-hourly');

SELECT cron.unschedule('hmac-cleanup-every-2-hours')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hmac-cleanup-every-2-hours');

SELECT cron.unschedule('security-cleanup-cron-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'security-cleanup-cron-daily');

SELECT cron.unschedule('cleanup-old-slo-states')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-slo-states');

SELECT cron.unschedule('cleanup-old-metrics-90days')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-metrics-90days');

SELECT cron.unschedule('integrity-sentinel-15min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'integrity-sentinel-15min');

SELECT cron.unschedule('cron-sentinel-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-sentinel-6h');

SELECT cron.unschedule('monitor-dlq-exhaustion-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitor-dlq-exhaustion-6h');

SELECT cron.unschedule('auto-execute-ai-actions-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-execute-ai-actions-6h');

SELECT cron.unschedule('auto-approve-safe-ai-actions-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-approve-safe-ai-actions-daily');

SELECT cron.unschedule('calculate-compliance-every-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-compliance-every-6h');

SELECT cron.unschedule('auto-resolve-stale-tasks')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-resolve-stale-tasks');

SELECT cron.unschedule('rollback-test-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rollback-test-weekly');

SELECT cron.unschedule('dlq-cleanup-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dlq-cleanup-weekly');

-- Schedule matview refresh every 6h
SELECT cron.schedule(
  'refresh-dashboard-matviews',
  '15 */6 * * *',
  $$SELECT refresh_dashboard_matviews()$$
);
