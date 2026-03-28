
-- =============================================
-- UNIFIED AGENT STATUS THRESHOLDS MIGRATION
-- Aligns ALL views to frontend constants:
--   Online:  <= 12 min
--   Warning: <= 20 min  
--   Offline: > 30 min
-- =============================================

-- 1. v_agent_state: was 10min offline, 5min warning ? 30min offline, 20min warning, 12min online
CREATE OR REPLACE VIEW public.v_agent_state
WITH (security_invoker = on, security_barrier = true) AS
SELECT 
    id AS agent_id,
    id,
    tenant_id,
    hostname,
    agent_name,
    display_name,
    last_heartbeat,
    agent_version,
    agent_state,
    agent_state_reason,
    is_isolated,
    is_throttled,
    safe_mode_reason,
    safe_mode_entered_at,
    CASE
        WHEN archived_at IS NOT NULL THEN 'archived'
        WHEN is_isolated THEN 'isolated'
        WHEN agent_state = 'safe_mode' THEN 'safe_mode'
        WHEN last_heartbeat IS NULL THEN 'never_connected'
        WHEN last_heartbeat < (now() - interval '30 minutes') THEN 'offline'
        WHEN last_heartbeat < (now() - interval '12 minutes') THEN 'warning'
        ELSE 'healthy'
    END AS canonical_state,
    EXTRACT(epoch FROM now() - last_heartbeat) AS heartbeat_lag_seconds,
    round(EXTRACT(epoch FROM now() - last_heartbeat) / 60.0, 1) AS heartbeat_lag_minutes,
    now() AS snapshot_at
FROM agents a
WHERE status = 'active' AND archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 2. v_agent_health_summary: was 15min online, 1hr offline ? 12min online, 30min offline
CREATE OR REPLACE VIEW public.v_agent_health_summary
WITH (security_invoker = on, security_barrier = true) AS
SELECT 
    tenant_id,
    count(*) AS total_agents,
    count(*) FILTER (WHERE status = 'active' AND last_heartbeat > (now() - interval '12 minutes')) AS online,
    count(*) FILTER (WHERE last_heartbeat < (now() - interval '12 minutes') AND last_heartbeat > (now() - interval '30 minutes')) AS degraded,
    count(*) FILTER (WHERE last_heartbeat < (now() - interval '30 minutes') OR last_heartbeat IS NULL) AS offline,
    count(*) FILTER (WHERE is_isolated = true) AS isolated,
    count(*) FILTER (WHERE agent_state = 'safe_mode') AS safe_mode
FROM agents
WHERE archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id;

-- 3. v_agent_health_by_node: was 15min ? 12min
CREATE OR REPLACE VIEW public.v_agent_health_by_node
WITH (security_invoker = on, security_barrier = true) AS
SELECT 
    tenant_id,
    hostname,
    count(*) AS total_agents,
    count(*) FILTER (WHERE status = 'active' AND last_heartbeat > (now() - interval '12 minutes')) AS healthy,
    count(*) FILTER (WHERE last_heartbeat < (now() - interval '12 minutes')) AS unhealthy,
    count(*) FILTER (WHERE is_isolated = true) AS isolated
FROM agents
WHERE archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id, hostname;

-- 4. v_problematic_agents: was 15min degraded, 1hr offline ? 12min degraded, 30min offline
CREATE OR REPLACE VIEW public.v_problematic_agents
WITH (security_invoker = on, security_barrier = true) AS
SELECT 
    id,
    tenant_id,
    agent_name,
    display_name,
    hostname,
    status,
    agent_state,
    last_heartbeat,
    agent_version,
    enrolled_at,
    is_isolated,
    isolation_reason,
    CASE
        WHEN is_isolated THEN 'isolated'
        WHEN agent_state = 'safe_mode' THEN 'safe_mode'
        WHEN last_heartbeat < (now() - interval '30 minutes') THEN 'offline'
        WHEN last_heartbeat < (now() - interval '12 minutes') THEN 'degraded'
        ELSE 'unknown'
    END AS problem_type,
    GREATEST(last_heartbeat, isolated_at, agent_state_changed_at) AS problem_since
FROM agents
WHERE archived_at IS NULL
  AND (is_isolated OR agent_state = 'safe_mode' OR last_heartbeat < (now() - interval '12 minutes'))
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 5. v_agent_lifecycle_state: was 1hr offline ? 30min offline
CREATE OR REPLACE VIEW public.v_agent_lifecycle_state
WITH (security_invoker = on, security_barrier = true) AS
SELECT 
    id,
    id AS agent_id,
    tenant_id,
    agent_name,
    display_name,
    status,
    agent_state,
    enrolled_at,
    last_heartbeat,
    archived_at,
    archived_reason,
    enrolled_at AS command_copied_at,
    last_heartbeat AS agent_installed_at,
    CASE
        WHEN enrolled_at IS NOT NULL AND last_heartbeat IS NOT NULL 
        THEN EXTRACT(epoch FROM last_heartbeat - enrolled_at) / 60.0
        ELSE NULL
    END AS minutes_between_copy_and_install,
    CASE
        WHEN archived_at IS NOT NULL THEN 'archived'
        WHEN agent_state = 'safe_mode' THEN 'safe_mode'
        WHEN is_isolated THEN 'isolated'
        WHEN last_heartbeat < (now() - interval '30 minutes') THEN 'offline'
        WHEN last_heartbeat IS NOT NULL THEN 'active'
        WHEN enrolled_at IS NOT NULL AND last_heartbeat IS NULL THEN 'pending_install'
        ELSE 'enrolled_only'
    END AS lifecycle_status,
    CASE
        WHEN enrolled_at IS NOT NULL AND last_heartbeat IS NULL AND enrolled_at < (now() - interval '30 minutes') THEN true
        ELSE false
    END AS is_stuck
FROM agents a
WHERE archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());
