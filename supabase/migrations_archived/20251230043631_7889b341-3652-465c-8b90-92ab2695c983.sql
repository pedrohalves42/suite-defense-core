-- Fix Security Definer Views by adding security_invoker = true
-- This ensures RLS policies of the querying user are respected

-- Drop and recreate v_job_metrics_by_type with security_invoker
DROP VIEW IF EXISTS v_job_metrics_by_type;
CREATE VIEW v_job_metrics_by_type 
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  type,
  COUNT(*) as total_jobs,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'queued') as queued,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE status = 'delivered' 
    AND delivered_at < NOW() - INTERVAL '1 hour') as stuck,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))::numeric, 2) as avg_execution_seconds,
  ROUND((COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
    NULLIF(COUNT(*), 0) * 100), 1) as success_rate_pct
FROM jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tenant_id, type;

-- Drop and recreate v_job_hourly_trends with security_invoker
DROP VIEW IF EXISTS v_job_hourly_trends;
CREATE VIEW v_job_hourly_trends 
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  date_trunc('hour', created_at) as hour,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND((COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
    NULLIF(COUNT(*), 0) * 100), 1) as success_rate_pct
FROM jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tenant_id, date_trunc('hour', created_at)
ORDER BY hour DESC;