
-- =====================================================
-- RLS Hardening Phase 4: Fix Views Without Tenant Filter
-- ADR-024 continuation
-- =====================================================

-- 1. v_agent_lifecycle_state - Add tenant filter
DROP VIEW IF EXISTS public.v_agent_lifecycle_state CASCADE;

CREATE OR REPLACE VIEW public.v_agent_lifecycle_state
WITH (security_invoker = true) AS
SELECT 
  id AS agent_id,
  tenant_id,
  agent_name,
  agent_state,
  agent_state_reason,
  agent_state_changed_at,
  is_isolated,
  isolation_reason,
  isolated_at,
  requires_revalidation,
  revalidation_reason,
  revalidation_required_at,
  safe_mode_entered_at,
  safe_mode_reason,
  force_update_version,
  force_update_reason,
  force_update_at,
  last_forced_update_applied,
  last_heartbeat,
  CASE
    WHEN agent_state = 'offline' AND last_heartbeat < (now() - INTERVAL '30 minutes') 
         AND EXISTS (
           SELECT 1 FROM enrollment_keys ek
           WHERE ek.tenant_id = a.tenant_id 
             AND ek.is_active = true 
             AND ek.created_at > (now() - INTERVAL '24 hours')
         ) THEN 'stuck_installation'
    WHEN agent_state = 'degraded' THEN 'degraded'
    WHEN agent_state = 'offline' THEN 'offline'
    WHEN agent_state = 'healthy' THEN 'healthy'
    ELSE 'unknown'
  END AS lifecycle_status,
  CASE
    WHEN agent_state = 'offline' AND last_heartbeat < (now() - INTERVAL '30 minutes') THEN true
    ELSE false
  END AS is_stuck
FROM agents a
WHERE status = 'active'
  AND (
    tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

-- 2. v_ai_anomalies - Add tenant filter
DROP VIEW IF EXISTS public.v_ai_anomalies CASCADE;

CREATE OR REPLACE VIEW public.v_ai_anomalies
WITH (security_invoker = true) AS
WITH action_stats AS (
  SELECT 
    a.action_type,
    a.tenant_id,
    count(*) AS total_actions,
    count(*) FILTER (WHERE ae.execution_status = 'executed') AS executed,
    count(*) FILTER (WHERE ae.execution_status = 'failed') AS failed,
    count(*) FILTER (WHERE i.status = 'resolved') AS resolved_insights
  FROM ai_actions a
  LEFT JOIN ai_action_executions ae ON a.id = ae.action_id
  LEFT JOIN ai_insights i ON a.insight_id = i.id
  WHERE a.created_at > (now() - INTERVAL '7 days')
  GROUP BY a.action_type, a.tenant_id
)
SELECT 
  action_type,
  tenant_id,
  total_actions,
  executed,
  failed,
  resolved_insights,
  CASE
    WHEN total_actions > 0 AND (resolved_insights::double precision / total_actions::double precision) < 0.1 THEN 'low_resolution_rate'
    WHEN failed > executed THEN 'high_failure_rate'
    ELSE NULL
  END AS anomaly_type,
  CASE
    WHEN total_actions > 0 AND (resolved_insights::double precision / total_actions::double precision) < 0.1 THEN 'critical'
    WHEN failed > executed THEN 'high'
    ELSE 'none'
  END AS severity
FROM action_stats
WHERE total_actions > 0 
  AND (
    (resolved_insights::double precision / total_actions::double precision) < 0.1 
    OR failed > executed
  )
  AND (
    tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

-- 3. v_audit_moving_average - Add tenant filter
DROP VIEW IF EXISTS public.v_audit_moving_average CASCADE;

CREATE OR REPLACE VIEW public.v_audit_moving_average
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  created_at,
  overall_score,
  avg(overall_score) OVER (PARTITION BY tenant_id ORDER BY created_at ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS moving_avg_5,
  (overall_score - lag(overall_score) OVER (PARTITION BY tenant_id ORDER BY created_at)) AS score_delta
FROM system_audits s
WHERE (
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
)
ORDER BY tenant_id, created_at;

-- 4. v_cron_silent_failures - Add tenant filter
DROP VIEW IF EXISTS public.v_cron_silent_failures CASCADE;

CREATE OR REPLACE VIEW public.v_cron_silent_failures
WITH (security_invoker = true) AS
SELECT 
  sj.id,
  sj.tenant_id,
  sj.job_key,
  sj.name AS job_name,
  sj.job_type,
  sj.cron_expr,
  sj.last_run_at,
  (SELECT max(sjr.ran_at) FROM scheduled_job_runs sjr WHERE sjr.job_key = sj.job_key AND sjr.success = true) AS last_successful_run,
  (now() - COALESCE(
    (SELECT max(sjr.ran_at) FROM scheduled_job_runs sjr WHERE sjr.job_key = sj.job_key AND sjr.success = true),
    sj.created_at
  )) AS silence_duration,
  CASE
    WHEN (SELECT max(sjr.ran_at) FROM scheduled_job_runs sjr WHERE sjr.job_key = sj.job_key AND sjr.success = true) IS NULL THEN 'NEVER_RAN'
    WHEN (now() - (SELECT max(sjr.ran_at) FROM scheduled_job_runs sjr WHERE sjr.job_key = sj.job_key AND sjr.success = true)) > INTERVAL '4 hours' THEN 'STALE'
    ELSE 'OK'
  END AS health_status
FROM scheduled_jobs sj
WHERE sj.enabled = true
  AND (
    sj.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

-- 5. v_edge_function_stats - Add tenant filter (table has tenant_id)
DROP VIEW IF EXISTS public.v_edge_function_stats CASCADE;

CREATE OR REPLACE VIEW public.v_edge_function_stats
WITH (security_invoker = true) AS
SELECT 
  function_name,
  tenant_id,
  count(*) AS total_calls,
  count(*) FILTER (WHERE success = true) AS successful_calls,
  count(*) FILTER (WHERE success = false) AS failed_calls,
  round(avg(latency_ms), 2) AS avg_latency_ms,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms::double precision) AS p50_latency_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms::double precision) AS p95_latency_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms::double precision) AS p99_latency_ms,
  min(latency_ms) AS min_latency_ms,
  max(latency_ms) AS max_latency_ms,
  min(created_at) AS first_call,
  max(created_at) AS last_call
FROM edge_function_metrics
WHERE created_at > (now() - INTERVAL '24 hours')
  AND (
    tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
GROUP BY function_name, tenant_id
ORDER BY count(*) DESC;

-- 6. v_enforcement_compliance - Add tenant filter
DROP VIEW IF EXISTS public.v_enforcement_compliance CASCADE;

CREATE OR REPLACE VIEW public.v_enforcement_compliance
WITH (security_invoker = true) AS
SELECT 
  sp.tenant_id,
  count(DISTINCT sp.id) AS total_policies,
  count(DISTINCT sp.id) FILTER (WHERE sp.is_active = true) AS active_policies,
  count(DISTINCT agp.id) AS policy_assignments,
  count(DISTINCT ag.id) AS groups_with_policies
FROM security_policies sp
LEFT JOIN agent_group_policies agp ON agp.policy_id = sp.id
LEFT JOIN agent_groups ag ON ag.id = agp.group_id
WHERE (
  sp.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
)
GROUP BY sp.tenant_id;

-- 7. v_execution_chain_health - Add tenant filter
DROP VIEW IF EXISTS public.v_execution_chain_health CASCADE;

CREATE OR REPLACE VIEW public.v_execution_chain_health
WITH (security_invoker = true) AS
SELECT 
  c.agent_id,
  a.tenant_id,
  a.agent_name,
  c.last_execution_index,
  c.last_execution_hash,
  c.updated_at,
  CASE
    WHEN c.updated_at > (now() - INTERVAL '5 minutes') THEN 'healthy'
    WHEN c.updated_at > (now() - INTERVAL '15 minutes') THEN 'warning'
    ELSE 'critical'
  END AS chain_status,
  EXTRACT(epoch FROM (now() - c.updated_at)) AS seconds_since_update
FROM agent_execution_chain c
JOIN agents a ON a.id = c.agent_id
WHERE a.archived_at IS NULL
  AND (
    a.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

-- 8. v_task_stats - Add tenant filter
DROP VIEW IF EXISTS public.v_task_stats CASCADE;

CREATE OR REPLACE VIEW public.v_task_stats
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  count(*) FILTER (WHERE status = 'open') AS open_count,
  count(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
  count(*) FILTER (WHERE status = 'blocked') AS blocked_count,
  count(*) FILTER (WHERE status = 'resolved') AS resolved_count,
  count(*) FILTER (WHERE status = 'ignored') AS ignored_count,
  count(*) FILTER (WHERE status = 'open' AND severity = 'critical') AS critical_open,
  count(*) FILTER (WHERE status = 'open' AND severity = 'high') AS high_open,
  count(*) FILTER (WHERE sla_breached_at IS NOT NULL AND status IN ('open', 'in_progress')) AS sla_breached,
  avg((EXTRACT(epoch FROM (closed_at - created_at)) / 3600::numeric)) FILTER (WHERE closed_at IS NOT NULL) AS avg_resolution_hours
FROM tasks
WHERE (
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
)
GROUP BY tenant_id;

-- 9. v_system_contracts - Static enum view, no tenant data (mark as intentionally public)
-- This view contains only static enum values, no sensitive data
-- No changes needed - it's a reference table for valid enum values

-- Add comment to document intentional public access
COMMENT ON VIEW public.v_system_contracts IS 'Static enum reference view - intentionally public, contains no tenant-specific data';
