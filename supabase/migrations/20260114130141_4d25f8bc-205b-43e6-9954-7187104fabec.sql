-- ============================================================================
-- ADR-024 Phase 3: Complete View Hardening - Fix All Permission & Filter Issues
-- ============================================================================
-- Fixes:
-- 1. agent_releases_public - add super_admin access
-- 2. v_agent_health_summary - add tenant + super_admin filter
-- 3. v_dlq_pending_attention - add tenant + super_admin filter
-- 4. v_problematic_agents - add tenant + super_admin filter
-- 5. v_stuck_jobs_report - add super_admin access
-- 6. agent_system_metrics_unified - add super_admin access
-- 7. agent_timeline_events - add super_admin access
-- ============================================================================

-- 1. Fix agent_releases_public - allow authenticated users to see active releases
DROP VIEW IF EXISTS public.agent_releases_public CASCADE;
CREATE OR REPLACE VIEW public.agent_releases_public
WITH (security_invoker = true) AS
SELECT 
  id,
  version,
  platform,
  channel,
  sha256,
  release_notes,
  is_active,
  created_at
FROM public.agent_releases
WHERE is_active = true
  AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
    OR public.is_current_super_admin()
  );

COMMENT ON VIEW public.agent_releases_public IS 'Public view of active agent releases - accessible to any authenticated user';

-- 2. Fix v_agent_health_summary - add tenant + super_admin filter
DROP VIEW IF EXISTS public.v_agent_health_summary CASCADE;
CREATE OR REPLACE VIEW public.v_agent_health_summary
WITH (security_invoker = true) AS
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
  a.is_isolated,
  m.cpu_usage_percent AS latest_cpu,
  m.memory_usage_percent AS latest_memory,
  m.disk_usage_percent AS latest_disk,
  m.uptime_seconds AS latest_uptime,
  CASE
    WHEN a.is_isolated = true THEN 'isolated'
    WHEN a.agent_state = 'safe_mode' THEN 'critical'
    WHEN a.last_heartbeat < (now() - interval '15 minutes') THEN 'critical'
    WHEN a.last_heartbeat < (now() - interval '5 minutes') THEN 'warning'
    WHEN COALESCE(m.cpu_usage_percent, 0) > 90 
      OR COALESCE(m.memory_usage_percent, 0) > 90 
      OR COALESCE(m.disk_usage_percent, 0) > 90 THEN 'warning'
    ELSE 'healthy'
  END AS health_status,
  (
    SELECT count(*)
    FROM public.agent_rollback_events r
    WHERE r.agent_id = a.id AND r.created_at > (now() - interval '24 hours')
  ) AS rollbacks_24h,
  (
    SELECT count(*)
    FROM public.agent_safe_mode_events s
    WHERE s.agent_id = a.id AND s.resolved_at IS NULL
  ) AS active_safe_mode_events
FROM public.agents a
LEFT JOIN LATERAL (
  SELECT 
    cpu_usage_percent,
    memory_usage_percent,
    disk_usage_percent,
    uptime_seconds
  FROM public.agent_system_metrics
  WHERE agent_id = a.id
  ORDER BY collected_at DESC
  LIMIT 1
) m ON true
WHERE a.archived_at IS NULL
  AND (
    a.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

COMMENT ON VIEW public.v_agent_health_summary IS 'Summary of agent health with tenant isolation - ADR-024';

-- 3. Fix v_dlq_pending_attention - add tenant + super_admin filter
DROP VIEW IF EXISTS public.v_dlq_pending_attention CASCADE;
CREATE OR REPLACE VIEW public.v_dlq_pending_attention
WITH (security_invoker = true) AS
SELECT 
  d.id,
  d.original_job_id,
  d.tenant_id,
  d.agent_id,
  d.agent_name,
  d.job_type,
  d.payload,
  d.error_message,
  d.error_count,
  d.first_failure_at,
  d.last_failure_at,
  d.retry_count,
  d.max_retries,
  d.next_retry_at,
  d.status,
  d.resolution_notes,
  d.resolved_at,
  d.resolved_by,
  d.metadata,
  d.created_at,
  d.failure_class,
  d.review_notes,
  d.risk_category,
  d.review_required,
  d.flagged_suspicious,
  d.auto_flagged_reason,
  d.payload_hash,
  d.payload_schema,
  d.payload_excerpt,
  d.classification,
  d.decision_event_id,
  d.resolution_source,
  (EXTRACT(epoch FROM (now() - d.created_at)) / 3600) AS hours_pending
FROM public.failed_jobs_dlq d
WHERE d.status = 'pending'
  AND d.created_at < (now() - interval '1 hour')
  AND d.review_required = true
  AND (
    d.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

COMMENT ON VIEW public.v_dlq_pending_attention IS 'DLQ items pending review with tenant isolation - ADR-024';

-- 4. Fix v_problematic_agents - add tenant + super_admin filter
DROP VIEW IF EXISTS public.v_problematic_agents CASCADE;
CREATE OR REPLACE VIEW public.v_problematic_agents
WITH (security_invoker = true) AS
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
  a.is_isolated,
  a.isolation_reason,
  CASE
    WHEN a.is_isolated = true THEN 'isolated'
    WHEN a.agent_state = 'safe_mode' THEN 'safe_mode'
    WHEN a.last_heartbeat < (now() - interval '1 hour') THEN 'offline'
    WHEN a.last_heartbeat < (now() - interval '15 minutes') THEN 'degraded'
    ELSE 'unknown'
  END AS problem_type,
  GREATEST(a.last_heartbeat, a.isolated_at, a.agent_state_changed_at) AS problem_since
FROM public.agents a
WHERE a.archived_at IS NULL
  AND (
    a.is_isolated = true 
    OR a.agent_state = 'safe_mode'
    OR a.last_heartbeat < (now() - interval '15 minutes')
  )
  AND (
    a.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

COMMENT ON VIEW public.v_problematic_agents IS 'Agents with issues requiring attention - tenant filtered - ADR-024';

-- 5. Fix v_stuck_jobs_report - add super_admin access
DROP VIEW IF EXISTS public.v_stuck_jobs_report CASCADE;
CREATE OR REPLACE VIEW public.v_stuck_jobs_report
WITH (security_invoker = true) AS
SELECT 
  j.id,
  j.agent_name,
  j.type,
  j.status,
  j.tenant_id,
  j.created_at,
  j.delivered_at,
  (EXTRACT(epoch FROM (now() - COALESCE(j.delivered_at, j.created_at))) / 60) AS minutes_stuck,
  CASE
    WHEN j.status = 'delivered' AND j.delivered_at < (now() - interval '30 minutes') THEN 'stuck_delivered'
    WHEN j.status = 'queued' AND j.created_at < (now() - interval '2 hours') THEN 'stuck_queued'
    WHEN j.status = 'pending' AND j.created_at < (now() - interval '1 hour') THEN 'stuck_pending'
    ELSE 'normal'
  END AS problem_type
FROM public.jobs j
WHERE (
    j.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
  AND (
    (j.status = 'delivered' AND j.delivered_at < (now() - interval '30 minutes'))
    OR (j.status = 'queued' AND j.created_at < (now() - interval '2 hours'))
    OR (j.status = 'pending' AND j.created_at < (now() - interval '1 hour'))
  );

COMMENT ON VIEW public.v_stuck_jobs_report IS 'Jobs that appear stuck - tenant filtered - ADR-024';

-- 6. Fix agent_system_metrics_unified - add super_admin access
DROP VIEW IF EXISTS public.agent_system_metrics_unified CASCADE;
CREATE OR REPLACE VIEW public.agent_system_metrics_unified
WITH (security_invoker = true) AS
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
FROM public.agent_system_metrics asm
WHERE (
    asm.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
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
FROM public.agent_system_metrics_partitioned asmp
WHERE asmp.collected_at >= (CURRENT_DATE - interval '90 days')
  AND (
    asmp.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

COMMENT ON VIEW public.agent_system_metrics_unified IS 'Unified view of agent metrics from all sources - tenant filtered - ADR-024';

-- 7. Fix agent_timeline_events - add super_admin access
DROP VIEW IF EXISTS public.agent_timeline_events CASCADE;
CREATE OR REPLACE VIEW public.agent_timeline_events
WITH (security_invoker = true) AS
-- Jobs events
SELECT 
  j.tenant_id,
  j.agent_id,
  j.id AS source_id,
  'job'::text AS event_type,
  CASE
    WHEN j.status = 'queued' THEN 'job_queued'
    WHEN j.status = 'delivered' THEN 'job_delivered'
    WHEN j.status = 'completed' THEN 'job_completed'
    WHEN j.status = 'failed' THEN 'job_failed'
    ELSE 'job_event'
  END AS event_key,
  COALESCE(j.created_at, now()) AS event_time,
  jsonb_build_object('job_type', j.type, 'status', j.status, 'error_message', j.error_message) AS data
FROM public.jobs j
WHERE (
    j.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
UNION ALL
-- Heartbeat events
SELECT 
  a.tenant_id,
  a.id AS agent_id,
  a.id AS source_id,
  'heartbeat'::text AS event_type,
  'heartbeat_received'::text AS event_key,
  a.last_heartbeat AS event_time,
  jsonb_build_object('agent_name', a.agent_name, 'hostname', a.hostname, 'os_type', a.os_type, 'agent_version', a.agent_version, 'status', a.status) AS data
FROM public.agents a
WHERE a.last_heartbeat IS NOT NULL
  AND a.last_heartbeat > (now() - interval '24 hours')
  AND (
    a.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
UNION ALL
-- Metrics events
SELECT 
  m.tenant_id,
  m.agent_id,
  m.id AS source_id,
  'metrics'::text AS event_type,
  'metrics_collected'::text AS event_key,
  m.collected_at AS event_time,
  jsonb_build_object('cpu_usage', m.cpu_usage_percent, 'memory_usage', m.memory_usage_percent, 'disk_usage', m.disk_usage_percent) AS data
FROM public.agent_system_metrics m
WHERE m.collected_at > (now() - interval '24 hours')
  AND (
    m.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
UNION ALL
-- Alert events
SELECT 
  sa.tenant_id,
  sa.agent_id,
  sa.id AS source_id,
  'alert'::text AS event_type,
  sa.alert_type AS event_key,
  sa.created_at AS event_time,
  jsonb_build_object('message', sa.message, 'severity', sa.severity, 'acknowledged', sa.acknowledged) AS data
FROM public.system_alerts sa
WHERE sa.created_at > (now() - interval '24 hours')
  AND (
    sa.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

COMMENT ON VIEW public.agent_timeline_events IS 'Timeline of agent events for dashboards - tenant filtered - ADR-024';

-- ============================================================================
-- Ensure agent_releases has proper RLS for authenticated users
-- ============================================================================

-- Check if policy exists and create if not
DO $$
BEGIN
  -- Drop existing policies that might conflict
  DROP POLICY IF EXISTS "Authenticated users can view active releases" ON public.agent_releases;
  
  -- Create policy allowing any authenticated user to view active releases
  CREATE POLICY "Authenticated users can view active releases"
    ON public.agent_releases
    FOR SELECT
    TO authenticated
    USING (is_active = true OR public.is_current_super_admin());
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Policy already exists
END $$;

-- ============================================================================
-- Grant necessary permissions
-- ============================================================================
GRANT SELECT ON public.agent_releases_public TO authenticated;
GRANT SELECT ON public.v_agent_health_summary TO authenticated;
GRANT SELECT ON public.v_dlq_pending_attention TO authenticated;
GRANT SELECT ON public.v_problematic_agents TO authenticated;
GRANT SELECT ON public.v_stuck_jobs_report TO authenticated;
GRANT SELECT ON public.agent_system_metrics_unified TO authenticated;
GRANT SELECT ON public.agent_timeline_events TO authenticated;