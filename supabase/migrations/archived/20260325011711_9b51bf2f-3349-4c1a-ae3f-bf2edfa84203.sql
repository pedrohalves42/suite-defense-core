
-- Fix: Revoke API access to materialized views (they should only be accessed via service_role)
REVOKE ALL ON mv_fleet_summary FROM anon, authenticated;
REVOKE ALL ON mv_job_metrics_24h FROM anon, authenticated;
REVOKE ALL ON mv_security_posture FROM anon, authenticated;
REVOKE ALL ON mv_alert_summary FROM anon, authenticated;

-- Grant only to authenticated (dashboard queries need it via RLS)
GRANT SELECT ON mv_fleet_summary TO authenticated;
GRANT SELECT ON mv_job_metrics_24h TO authenticated;
GRANT SELECT ON mv_security_posture TO authenticated;
GRANT SELECT ON mv_alert_summary TO authenticated;
