
CREATE OR REPLACE VIEW public.v_job_metrics_by_type
WITH (security_invoker=on) AS
SELECT 
  tenant_id,
  type,
  count(*) AS total_count,
  count(*) FILTER (WHERE status = 'completed') AS completed_count,
  count(*) FILTER (WHERE status = 'failed') AS failed_count,
  avg(EXTRACT(epoch FROM completed_at - created_at)) FILTER (WHERE completed_at IS NOT NULL) AS avg_duration_seconds
FROM jobs j
WHERE auth.uid() IS NOT NULL 
  AND created_at > (now() - interval '24 hours')
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id, type;
