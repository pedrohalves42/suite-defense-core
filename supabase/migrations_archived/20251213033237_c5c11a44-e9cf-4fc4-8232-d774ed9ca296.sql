
-- ============================================
-- Recreate v_agent_lifecycle_state and v_problematic_agents with full schemas
-- Maintains security_invoker=on for RLS enforcement
-- ============================================

-- 1. Recreate v_agent_lifecycle_state with full computed columns
DROP VIEW IF EXISTS public.v_agent_lifecycle_state;
CREATE VIEW public.v_agent_lifecycle_state
WITH (security_invoker = on)
AS
SELECT 
  a.id AS agent_id,
  a.agent_name,
  a.tenant_id,
  a.status AS agent_status,
  a.enrolled_at::text AS enrolled_at,
  a.last_heartbeat::text AS last_heartbeat,
  a.os_type,
  a.os_version,
  a.hostname,
  -- Installation stage timestamps from installation_analytics
  (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'generated' ORDER BY ia.created_at DESC LIMIT 1) AS generated_at,
  (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'downloaded' ORDER BY ia.created_at DESC LIMIT 1) AS downloaded_at,
  (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied' ORDER BY ia.created_at DESC LIMIT 1) AS command_copied_at,
  (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation') ORDER BY ia.created_at DESC LIMIT 1) AS installed_at,
  -- Lifecycle stage calculation
  CASE
    WHEN a.status = 'active' AND a.last_heartbeat > NOW() - INTERVAL '5 minutes' THEN 'active'
    WHEN EXISTS(SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation')) THEN 'installed_offline'
    WHEN EXISTS(SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied') THEN 'installing'
    WHEN EXISTS(SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'downloaded') THEN 'downloaded'
    WHEN EXISTS(SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'generated') THEN 'generated'
    ELSE 'unknown'
  END::text AS lifecycle_stage,
  -- Installation metrics
  (SELECT ia.installation_time_seconds FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation') AND ia.success = true ORDER BY ia.created_at DESC LIMIT 1) AS installation_time_seconds,
  (SELECT ia.success FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation') ORDER BY ia.created_at DESC LIMIT 1) AS installation_success,
  (SELECT ia.network_connectivity FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation') ORDER BY ia.created_at DESC LIMIT 1) AS network_connectivity,
  -- Error tracking
  (SELECT ia.error_message FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.success = false ORDER BY ia.created_at DESC LIMIT 1) AS last_error_message,
  (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.success = false ORDER BY ia.created_at DESC LIMIT 1) AS last_error_at,
  -- Platform and method
  (SELECT ia.platform FROM installation_analytics ia WHERE ia.agent_id = a.id ORDER BY ia.created_at DESC LIMIT 1) AS platform,
  (SELECT ia.installation_method FROM installation_analytics ia WHERE ia.agent_id = a.id ORDER BY ia.created_at DESC LIMIT 1) AS installation_method,
  (SELECT ia.metadata FROM installation_analytics ia WHERE ia.agent_id = a.id ORDER BY ia.created_at DESC LIMIT 1) AS installation_metadata,
  -- Time calculations
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) / 60 AS minutes_since_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at)) / 60 AS minutes_since_enrollment,
  -- Minutes between copy and install
  (
    SELECT EXTRACT(EPOCH FROM (
      (SELECT ia2.created_at FROM installation_analytics ia2 WHERE ia2.agent_id = a.id AND ia2.event_type IN ('installed', 'post_installation') ORDER BY ia2.created_at DESC LIMIT 1) -
      (SELECT ia3.created_at FROM installation_analytics ia3 WHERE ia3.agent_id = a.id AND ia3.event_type = 'command_copied' ORDER BY ia3.created_at DESC LIMIT 1)
    )) / 60
  ) AS minutes_between_copy_and_install,
  -- Stuck detection
  (
    EXISTS(SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied')
    AND NOT EXISTS(SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation'))
    AND (SELECT ia.created_at FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied' ORDER BY ia.created_at DESC LIMIT 1) < NOW() - INTERVAL '30 minutes'
  ) AS is_stuck
FROM agents a
WHERE a.tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
);

-- 2. Recreate v_problematic_agents with full schema
DROP VIEW IF EXISTS public.v_problematic_agents;
CREATE VIEW public.v_problematic_agents
WITH (security_invoker = on)
AS
SELECT 
  a.id,
  a.agent_name,
  a.status,
  a.enrolled_at::text AS enrolled_at,
  a.last_heartbeat::text AS last_heartbeat,
  a.hostname,
  a.os_type,
  a.tenant_id,
  t.name AS tenant_name,
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at)) / 60 AS minutes_since_enrollment,
  CASE
    WHEN a.status = 'pending' AND a.last_heartbeat IS NULL AND a.enrolled_at < NOW() - INTERVAL '30 minutes' THEN 'never_connected'
    WHEN a.last_heartbeat IS NOT NULL AND a.last_heartbeat < NOW() - INTERVAL '24 hours' THEN 'stale_heartbeat'
    WHEN a.status = 'error' THEN 'error_status'
    ELSE 'other'
  END AS issue_type,
  (SELECT COUNT(*)::integer FROM agent_tokens at WHERE at.agent_id = a.id) AS token_count,
  EXISTS(SELECT 1 FROM agent_tokens at WHERE at.agent_id = a.id AND at.is_active = true AND (at.expires_at IS NULL OR at.expires_at > NOW())) AS has_active_token,
  (SELECT COUNT(*)::integer FROM jobs j WHERE j.agent_id = a.id AND j.status IN ('queued', 'pending', 'delivered')) AS pending_jobs_count
FROM agents a
JOIN tenants t ON t.id = a.tenant_id
WHERE a.tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
)
AND (
  (a.status = 'pending' AND a.last_heartbeat IS NULL AND a.enrolled_at < NOW() - INTERVAL '30 minutes')
  OR (a.last_heartbeat IS NOT NULL AND a.last_heartbeat < NOW() - INTERVAL '24 hours')
  OR a.status = 'error'
);

-- Comments
COMMENT ON VIEW public.v_agent_lifecycle_state IS 'Agent lifecycle tracking view with full computed columns - security_invoker=on ensures tenant isolation';
COMMENT ON VIEW public.v_problematic_agents IS 'Problematic agents detection view - security_invoker=on ensures tenant isolation';
