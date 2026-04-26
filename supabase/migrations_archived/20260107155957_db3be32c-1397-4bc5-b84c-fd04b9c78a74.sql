-- Fix v_task_stats view to use security_invoker
DROP VIEW IF EXISTS v_task_stats;

CREATE OR REPLACE VIEW v_task_stats 
WITH (security_invoker = on) AS
SELECT 
  tenant_id,
  COUNT(*) FILTER (WHERE status = 'open') as open_count,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
  COUNT(*) FILTER (WHERE status = 'blocked') as blocked_count,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
  COUNT(*) FILTER (WHERE status = 'ignored') as ignored_count,
  COUNT(*) FILTER (WHERE status = 'open' AND severity = 'critical') as critical_open,
  COUNT(*) FILTER (WHERE status = 'open' AND severity = 'high') as high_open,
  COUNT(*) FILTER (WHERE sla_breached_at IS NOT NULL AND status IN ('open', 'in_progress')) as sla_breached,
  AVG(EXTRACT(EPOCH FROM (closed_at - created_at))/3600) FILTER (WHERE closed_at IS NOT NULL) as avg_resolution_hours
FROM tasks
GROUP BY tenant_id;