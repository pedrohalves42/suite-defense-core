
-- ADR-025: RLS Hardening Phase 3 - Fix All Remaining View Security Issues
-- Recreate views with proper security_invoker and tenant filtering

-- 1. CRITICAL: hmac_agent_secrets - Currently has NO security at all
-- This view MUST be restricted to admin/super_admin only
DROP VIEW IF EXISTS public.hmac_agent_secrets;
CREATE VIEW public.hmac_agent_secrets
WITH (security_invoker = true)
AS
SELECT 
  id AS agent_id,
  agent_name,
  hmac_secret,
  tenant_id
FROM agents a
WHERE (
  a.tenant_id IN (
    SELECT ur.tenant_id 
    FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin')
  )
) OR public.is_current_super_admin();

-- 2. job_failure_health - Currently exposes global failure data
-- Restrict to authenticated users with admin role
DROP VIEW IF EXISTS public.job_failure_health;
CREATE VIEW public.job_failure_health
WITH (security_invoker = true)
AS
SELECT 
  failure_class,
  count(*) AS total,
  count(*) FILTER (WHERE (created_at >= (now() - '24:00:00'::interval))) AS last_24h,
  count(*) FILTER (WHERE (created_at >= (now() - '7 days'::interval))) AS last_7d,
  CASE
    WHEN (failure_class = 'TRANSIENT'::text) THEN true
    ELSE false
  END AS is_retryable
FROM jobs
WHERE 
  status = 'failed'::text
  AND (
    tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
GROUP BY failure_class;

-- 3. circuit_breaker_health - Currently exposes all tenants' circuit breaker data
-- Add tenant filtering
DROP VIEW IF EXISTS public.circuit_breaker_health;
CREATE VIEW public.circuit_breaker_health
WITH (security_invoker = true)
AS
SELECT 
  service,
  state,
  failure_count,
  created_at AS last_event,
  tenant_id,
  CASE
    WHEN (state = 'open'::text) THEN 'critical'::text
    WHEN (state = 'half_open'::text) THEN 'warning'::text
    ELSE 'healthy'::text
  END AS health_status
FROM circuit_breaker_events cb1
WHERE 
  created_at = (
    SELECT max(cb2.created_at) 
    FROM circuit_breaker_events cb2 
    WHERE cb2.service = cb1.service
  )
  AND (
    tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

-- 4. dlq_categorized - Add security_invoker and ensure tenant filtering
DROP VIEW IF EXISTS public.dlq_categorized;
CREATE VIEW public.dlq_categorized
WITH (security_invoker = true)
AS
SELECT 
  id,
  tenant_id,
  agent_id,
  job_type,
  error_message,
  retry_count,
  status,
  created_at,
  resolved_at,
  resolved_by,
  review_notes,
  flagged_suspicious,
  COALESCE(risk_category,
    CASE
      WHEN (failure_class = ANY (ARRAY['security'::text, 'critical'::text, 'auth_failure'::text])) THEN 'security'::text
      WHEN (retry_count > 5) THEN 'reliability'::text
      ELSE 'operational'::text
    END) AS risk_category
FROM failed_jobs_dlq
WHERE 
  tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin();

-- 5. agent_web_activity - Add RLS policy for tenant isolation
-- First check if RLS is enabled, if not enable it
ALTER TABLE IF EXISTS public.agent_web_activity ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and create proper ones
DROP POLICY IF EXISTS "Users can view their tenant web activity" ON public.agent_web_activity;
DROP POLICY IF EXISTS "tenant_web_activity_select" ON public.agent_web_activity;

CREATE POLICY "tenant_web_activity_select"
ON public.agent_web_activity
FOR SELECT TO authenticated
USING (
  tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
);

-- Service role can insert (for edge functions)
DROP POLICY IF EXISTS "service_role_web_activity_insert" ON public.agent_web_activity;
CREATE POLICY "service_role_web_activity_insert"
ON public.agent_web_activity
FOR INSERT TO service_role
WITH CHECK (true);

-- 6. Verify and add security_invoker to remaining views that need it

-- agent_releases_public already has auth check but add security_invoker
DROP VIEW IF EXISTS public.agent_releases_public;
CREATE VIEW public.agent_releases_public
WITH (security_invoker = true)
AS
SELECT 
  id,
  version,
  platform,
  channel,
  sha256,
  release_notes,
  is_active,
  created_at
FROM agent_releases
WHERE is_active = true
  AND EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid());

-- The following views already have tenant filtering but let's ensure security_invoker is set:

-- agents_safe
DROP VIEW IF EXISTS public.agents_safe;
CREATE VIEW public.agents_safe
WITH (security_invoker = true)
AS
SELECT 
  id,
  tenant_id,
  agent_name,
  display_name,
  hostname,
  status,
  agent_state,
  agent_state_reason,
  agent_state_changed_at,
  last_heartbeat,
  agent_version,
  os_type,
  os_version,
  enrolled_at,
  is_isolated,
  isolated_at,
  isolation_reason,
  archived_at,
  archived_reason
FROM agents a
WHERE 
  tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin();

-- agent_timeline_events
DROP VIEW IF EXISTS public.agent_timeline_events;
CREATE VIEW public.agent_timeline_events
WITH (security_invoker = true)
AS
SELECT 
  j.tenant_id,
  j.agent_id,
  j.id AS source_id,
  'job'::text AS event_type,
  CASE
    WHEN (j.status = 'queued'::text) THEN 'job_queued'::text
    WHEN (j.status = 'delivered'::text) THEN 'job_delivered'::text
    WHEN (j.status = 'completed'::text) THEN 'job_completed'::text
    WHEN (j.status = 'failed'::text) THEN 'job_failed'::text
    ELSE 'job_event'::text
  END AS event_key,
  COALESCE(j.created_at, now()) AS event_time,
  jsonb_build_object('job_type', j.type, 'status', j.status, 'error_message', j.error_message) AS data
FROM jobs j
WHERE j.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
UNION ALL
SELECT 
  a.tenant_id,
  a.id AS agent_id,
  a.id AS source_id,
  'heartbeat'::text AS event_type,
  'heartbeat_received'::text AS event_key,
  a.last_heartbeat AS event_time,
  jsonb_build_object('agent_name', a.agent_name, 'hostname', a.hostname, 'os_type', a.os_type, 'agent_version', a.agent_version, 'status', a.status) AS data
FROM agents a
WHERE 
  a.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  AND a.last_heartbeat IS NOT NULL 
  AND a.last_heartbeat > (now() - '24:00:00'::interval)
UNION ALL
SELECT 
  m.tenant_id,
  m.agent_id,
  m.id AS source_id,
  'metrics'::text AS event_type,
  'metrics_collected'::text AS event_key,
  m.collected_at AS event_time,
  jsonb_build_object('cpu_usage', m.cpu_usage_percent, 'memory_usage', m.memory_usage_percent, 'disk_usage', m.disk_usage_percent) AS data
FROM agent_system_metrics m
WHERE 
  m.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  AND m.collected_at > (now() - '24:00:00'::interval)
UNION ALL
SELECT 
  sa.tenant_id,
  sa.agent_id,
  sa.id AS source_id,
  'alert'::text AS event_type,
  sa.alert_type AS event_key,
  sa.created_at AS event_time,
  jsonb_build_object('message', sa.message, 'severity', sa.severity, 'acknowledged', sa.acknowledged) AS data
FROM system_alerts sa
WHERE 
  sa.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  AND sa.created_at > (now() - '24:00:00'::interval);

-- installation_error_summary
DROP VIEW IF EXISTS public.installation_error_summary;
CREATE VIEW public.installation_error_summary
WITH (security_invoker = true)
AS
SELECT 
  tenant_id,
  platform,
  event_type,
  error_message,
  count(*) AS error_count,
  max(created_at) AS last_occurrence
FROM installation_analytics ia
WHERE 
  success = false 
  AND error_message IS NOT NULL 
  AND (
    tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
GROUP BY tenant_id, platform, event_type, error_message
ORDER BY count(*) DESC;

-- agents_health_view
DROP VIEW IF EXISTS public.agents_health_view;
CREATE VIEW public.agents_health_view
WITH (security_invoker = true)
AS
SELECT 
  a.id,
  a.tenant_id,
  a.agent_name,
  a.display_name,
  a.hostname,
  a.status,
  a.agent_state,
  a.last_heartbeat,
  a.agent_version,
  a.os_type,
  a.os_version,
  a.enrolled_at,
  a.is_isolated,
  a.isolation_reason,
  m.cpu_usage_percent,
  m.memory_usage_percent,
  m.disk_usage_percent,
  m.uptime_seconds,
  m.collected_at AS metrics_collected_at,
  CASE
    WHEN (a.last_heartbeat IS NULL) THEN 'unknown'::text
    WHEN (a.last_heartbeat > (now() - '00:05:00'::interval)) THEN 'healthy'::text
    WHEN (a.last_heartbeat > (now() - '00:15:00'::interval)) THEN 'warning'::text
    ELSE 'critical'::text
  END AS health_status
FROM agents a
LEFT JOIN LATERAL (
  SELECT 
    agent_system_metrics.cpu_usage_percent,
    agent_system_metrics.memory_usage_percent,
    agent_system_metrics.disk_usage_percent,
    agent_system_metrics.uptime_seconds,
    agent_system_metrics.collected_at
  FROM agent_system_metrics
  WHERE agent_system_metrics.agent_id = a.id
  ORDER BY agent_system_metrics.collected_at DESC
  LIMIT 1
) m ON true
WHERE 
  a.archived_at IS NULL 
  AND (
    a.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

-- enrollment_keys_safe
DROP VIEW IF EXISTS public.enrollment_keys_safe;
CREATE VIEW public.enrollment_keys_safe
WITH (security_invoker = true)
AS
SELECT 
  id,
  tenant_id,
  description,
  (left(key, 8) || '...' || right(key, 4)) AS key_masked,
  is_active,
  max_uses,
  current_uses,
  expires_at,
  created_at,
  used_at,
  used_by_agent,
  agent_id,
  created_by
FROM enrollment_keys ek
WHERE 
  tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin();

-- rate_limit_stats
DROP VIEW IF EXISTS public.rate_limit_stats;
CREATE VIEW public.rate_limit_stats
WITH (security_invoker = true)
AS
SELECT 
  endpoint,
  identifier,
  request_count,
  window_start,
  blocked_until,
  (blocked_until > now()) AS is_blocked
FROM rate_limits rl
WHERE EXISTS (
  SELECT 1 FROM user_roles ur 
  WHERE ur.user_id = auth.uid() 
  AND ur.role IN ('admin', 'super_admin')
);

-- agent_system_metrics_unified
DROP VIEW IF EXISTS public.agent_system_metrics_unified;
CREATE VIEW public.agent_system_metrics_unified
WITH (security_invoker = true)
AS
SELECT 
  asm.id,
  asm.agent_id,
  asm.tenant_id,
  asm.cpu_usage_percent,
  asm.cpu_name,
  asm.cpu_cores,
  asm.memory_total_gb,
  asm.memory_used_gb,
  asm.memory_free_gb,
  asm.memory_usage_percent,
  asm.disk_total_gb,
  asm.disk_used_gb,
  asm.disk_free_gb,
  asm.disk_usage_percent,
  asm.network_bytes_sent,
  asm.network_bytes_received,
  asm.uptime_seconds,
  asm.last_boot_time,
  asm.collected_at,
  asm.created_at
FROM agent_system_metrics asm
WHERE asm.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
UNION ALL
SELECT 
  asmp.id,
  asmp.agent_id,
  asmp.tenant_id,
  asmp.cpu_usage_percent,
  asmp.cpu_name,
  asmp.cpu_cores,
  asmp.memory_total_gb,
  asmp.memory_used_gb,
  asmp.memory_free_gb,
  asmp.memory_usage_percent,
  asmp.disk_total_gb,
  asmp.disk_used_gb,
  asmp.disk_free_gb,
  asmp.disk_usage_percent,
  asmp.network_bytes_sent,
  asmp.network_bytes_received,
  asmp.uptime_seconds,
  asmp.last_boot_time,
  asmp.collected_at,
  asmp.created_at
FROM agent_system_metrics_partitioned asmp
WHERE 
  asmp.collected_at >= (CURRENT_DATE - '90 days'::interval) 
  AND asmp.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid());

-- audit_logs_safe
DROP VIEW IF EXISTS public.audit_logs_safe;
CREATE VIEW public.audit_logs_safe
WITH (security_invoker = true)
AS
SELECT 
  id,
  created_at,
  tenant_id,
  success,
  details,
  action,
  resource_type,
  resource_id,
  CASE
    WHEN ip_address IS NOT NULL THEN 
      split_part(ip_address, '.', 1) || '.' || split_part(ip_address, '.', 2) || '.xxx.xxx'
    ELSE NULL
  END AS ip_address_masked,
  user_agent
FROM audit_logs
WHERE 
  tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin();

-- invites_safe
DROP VIEW IF EXISTS public.invites_safe;
CREATE VIEW public.invites_safe
WITH (security_invoker = true)
AS
SELECT 
  id,
  email,
  role,
  tenant_id,
  invited_by,
  status,
  created_at,
  expires_at,
  accepted_at
FROM invites
WHERE 
  tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin();

-- governance_health_metrics
DROP VIEW IF EXISTS public.governance_health_metrics;
CREATE VIEW public.governance_health_metrics
WITH (security_invoker = true)
AS
SELECT 
  t.id AS tenant_id,
  t.name AS tenant_name,
  COALESCE(e.active_policies, 0::bigint) AS active_policies,
  COALESCE(e.policy_assignments, 0::bigint) AS policy_assignments,
  COALESCE(r.total_users, 0::bigint) AS total_users,
  COALESCE(r.admin_count, 0::bigint) AS admin_count,
  COALESCE(i.isolated_count, 0::bigint) AS isolated_agents,
  COALESCE(i.safe_mode_count, 0::bigint) AS safe_mode_agents,
  COALESCE(i.pending_revalidation, 0::bigint) AS pending_revalidation,
  CASE
    WHEN COALESCE(i.isolated_count, 0::bigint) > 0 OR COALESCE(i.safe_mode_count, 0::bigint) > 0 THEN 'critical'::text
    WHEN COALESCE(i.pending_revalidation, 0::bigint) > 0 THEN 'warning'::text
    WHEN COALESCE(e.active_policies, 0::bigint) = 0 THEN 'warning'::text
    ELSE 'healthy'::text
  END AS governance_status
FROM tenants t
LEFT JOIN v_enforcement_compliance e ON e.tenant_id = t.id
LEFT JOIN v_rbac_metrics r ON r.tenant_id = t.id
LEFT JOIN v_tenant_isolation_metrics i ON i.tenant_id = t.id
WHERE 
  t.id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin();

-- job_integrity_violations
DROP VIEW IF EXISTS public.job_integrity_violations;
CREATE VIEW public.job_integrity_violations
WITH (security_invoker = true)
AS
SELECT 
  id AS job_id,
  agent_id,
  type AS job_type,
  status,
  created_at AS job_created_at,
  completed_at,
  CASE
    WHEN type = 'collect_web_activity' AND NOT EXISTS (
      SELECT 1 FROM agent_web_activity aw 
      WHERE aw.agent_id = j.agent_id 
      AND (aw.created_at >= j.created_at OR aw.visited_at >= j.created_at)
    ) THEN 'missing_web_activity'::text
    WHEN type = 'collect_system_metrics' AND NOT EXISTS (
      SELECT 1 FROM agent_system_metrics asm 
      WHERE asm.agent_id = j.agent_id 
      AND asm.created_at >= j.created_at
    ) THEN 'missing_metrics'::text
    ELSE NULL::text
  END AS violation_type
FROM jobs j
WHERE 
  status = 'completed' 
  AND created_at > (now() - '7 days'::interval) 
  AND (
    tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

-- insight_feedback_quality
DROP VIEW IF EXISTS public.insight_feedback_quality;
CREATE VIEW public.insight_feedback_quality
WITH (security_invoker = true)
AS
SELECT 
  ai.insight_type,
  f.tenant_id,
  count(*) AS total_feedback,
  count(*) FILTER (WHERE f.feedback_type = 'useful') AS useful,
  count(*) FILTER (WHERE f.feedback_type = 'noise') AS noise,
  count(*) FILTER (WHERE f.feedback_type = 'false_positive') AS false_positive,
  round((count(*) FILTER (WHERE f.feedback_type = 'useful')::numeric / NULLIF(count(*), 0)::numeric) * 100::numeric, 2) AS usefulness_rate
FROM ai_insight_feedback f
JOIN ai_insights ai ON ai.id = f.insight_id
WHERE 
  f.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin()
GROUP BY ai.insight_type, f.tenant_id;

-- jobs_normalized
DROP VIEW IF EXISTS public.jobs_normalized;
CREATE VIEW public.jobs_normalized
WITH (security_invoker = true)
AS
SELECT 
  id,
  tenant_id,
  agent_id,
  agent_name,
  type,
  status,
  status AS normalized_status,
  payload,
  output,
  error_message,
  approved,
  created_at,
  scheduled_at,
  delivered_at,
  started_at,
  completed_at,
  finished_at,
  execution_time_seconds,
  execution_time_seconds AS duration_seconds,
  is_recurring,
  recurrence_pattern,
  next_run_at,
  last_run_at,
  parent_job_id,
  CASE
    WHEN started_at IS NOT NULL OR finished_at IS NOT NULL THEN true
    ELSE false
  END AS is_v3,
  CASE
    WHEN status = 'queued' AND created_at < (now() - '01:00:00'::interval) THEN true
    WHEN status = 'delivered' AND delivered_at < (now() - '01:00:00'::interval) THEN true
    ELSE false
  END AS is_stuck
FROM jobs
WHERE 
  tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin();

-- agent_installation_metrics
DROP VIEW IF EXISTS public.agent_installation_metrics;
CREATE VIEW public.agent_installation_metrics
WITH (security_invoker = true)
AS
SELECT 
  tenant_id,
  platform,
  count(*) FILTER (WHERE event_type = 'generated') AS total_generated,
  count(*) FILTER (WHERE event_type = 'downloaded') AS total_downloaded,
  count(*) FILTER (WHERE event_type = 'command_copied') AS total_copied,
  count(*) FILTER (WHERE event_type IN ('installed', 'post_installation')) AS total_installed,
  count(*) FILTER (WHERE success = true) AS successful_events,
  count(*) FILTER (WHERE success = false) AS failed_events,
  round(avg(installation_time_seconds) FILTER (WHERE installation_time_seconds IS NOT NULL), 2) AS avg_install_time_seconds,
  count(*) FILTER (WHERE network_connectivity = true) AS with_network,
  count(*) FILTER (WHERE network_connectivity = false) AS without_network,
  max(created_at) AS last_event_at
FROM installation_analytics ia
WHERE 
  tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin()
GROUP BY tenant_id, platform;

-- Grant permissions on views
GRANT SELECT ON public.hmac_agent_secrets TO authenticated;
GRANT SELECT ON public.job_failure_health TO authenticated;
GRANT SELECT ON public.circuit_breaker_health TO authenticated;
GRANT SELECT ON public.dlq_categorized TO authenticated;
GRANT SELECT ON public.agent_releases_public TO authenticated;
GRANT SELECT ON public.agents_safe TO authenticated;
GRANT SELECT ON public.agent_timeline_events TO authenticated;
GRANT SELECT ON public.installation_error_summary TO authenticated;
GRANT SELECT ON public.agents_health_view TO authenticated;
GRANT SELECT ON public.enrollment_keys_safe TO authenticated;
GRANT SELECT ON public.rate_limit_stats TO authenticated;
GRANT SELECT ON public.agent_system_metrics_unified TO authenticated;
GRANT SELECT ON public.audit_logs_safe TO authenticated;
GRANT SELECT ON public.invites_safe TO authenticated;
GRANT SELECT ON public.governance_health_metrics TO authenticated;
GRANT SELECT ON public.job_integrity_violations TO authenticated;
GRANT SELECT ON public.insight_feedback_quality TO authenticated;
GRANT SELECT ON public.jobs_normalized TO authenticated;
GRANT SELECT ON public.agent_installation_metrics TO authenticated;
