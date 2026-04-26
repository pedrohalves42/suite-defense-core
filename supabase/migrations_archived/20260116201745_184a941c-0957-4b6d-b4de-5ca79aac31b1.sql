-- Phase 1: Fix view-frontend incompatibilities
-- ADR-026 Final Fixes (Corrected v3)

-- 1. Fix v_edge_function_stats - use edge_function_metrics table with correct columns
DROP VIEW IF EXISTS public.v_edge_function_stats;
CREATE VIEW public.v_edge_function_stats WITH (security_invoker = on) AS
SELECT 
  tenant_id, 
  function_name,
  count(*) AS total_calls,
  count(*) FILTER (WHERE success = true) AS successful,
  count(*) FILTER (WHERE success = false) AS failed,
  AVG(latency_ms) AS avg_execution_ms,
  -- Additional columns for EdgeFunctionStat interface
  count(*) FILTER (WHERE success = true) AS successful_calls,
  count(*) FILTER (WHERE success = false) AS failed_calls,
  AVG(latency_ms) AS avg_latency_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_latency_ms,
  MAX(created_at) AS last_called_at
FROM edge_function_metrics 
WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
GROUP BY tenant_id, function_name;

-- 2. Fix jobs_normalized - add normalized_status, is_v3, duration_seconds columns
-- Note: jobs table doesn't have queue_time_seconds column, so we compute it
DROP VIEW IF EXISTS public.jobs_normalized;
CREATE VIEW public.jobs_normalized WITH (security_invoker = on) AS
SELECT 
  id, 
  tenant_id, 
  agent_id, 
  agent_name, 
  type,
  status,
  status AS normalized_status,  -- alias for frontend compatibility
  priority, 
  created_at, 
  delivered_at, 
  completed_at,
  error_message, 
  payload_hash,
  CASE WHEN output IS NOT NULL THEN true ELSE false END AS is_v3,
  output,
  EXTRACT(epoch FROM (completed_at - delivered_at))::int AS duration_seconds,
  EXTRACT(epoch FROM (delivered_at - created_at))::numeric AS queue_time_seconds, 
  execution_time_seconds
FROM jobs 
WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin();