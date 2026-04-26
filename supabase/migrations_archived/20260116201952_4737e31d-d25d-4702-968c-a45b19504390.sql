-- Add missing columns to v_edge_function_stats for full interface compatibility
DROP VIEW IF EXISTS public.v_edge_function_stats;
CREATE VIEW public.v_edge_function_stats WITH (security_invoker = on) AS
SELECT 
  tenant_id, 
  function_name,
  count(*) AS total_calls,
  count(*) FILTER (WHERE success = true) AS successful,
  count(*) FILTER (WHERE success = false) AS failed,
  AVG(latency_ms) AS avg_execution_ms,
  -- Columns for EdgeFunctionStat interface
  count(*) FILTER (WHERE success = true) AS successful_calls,
  count(*) FILTER (WHERE success = false) AS failed_calls,
  AVG(latency_ms) AS avg_latency_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_latency_ms,
  MIN(latency_ms) AS min_latency_ms,
  MAX(latency_ms) AS max_latency_ms,
  MIN(created_at) AS first_call,
  MAX(created_at) AS last_call
FROM edge_function_metrics 
WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
GROUP BY tenant_id, function_name;