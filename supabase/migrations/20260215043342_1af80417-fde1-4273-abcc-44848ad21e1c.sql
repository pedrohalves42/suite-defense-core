
-- Fix v_problematic_agents: change to security_definer so it can read from agents table
-- The view already has proper tenant filtering in its WHERE clause
DROP VIEW IF EXISTS v_problematic_agents;

CREATE VIEW public.v_problematic_agents
WITH (security_invoker=off) AS
SELECT id,
    tenant_id,
    agent_name,
    display_name,
    hostname,
    status,
    agent_state,
    last_heartbeat,
    agent_version,
    is_isolated,
    isolation_reason,
    CASE
        WHEN is_isolated THEN 'isolated'::text
        WHEN (agent_state = 'safe_mode'::text) THEN 'safe_mode'::text
        WHEN (last_heartbeat < (now() - '01:00:00'::interval)) THEN 'offline'::text
        WHEN (last_heartbeat < (now() - '00:15:00'::interval)) THEN 'degraded'::text
        ELSE 'unknown'::text
    END AS problem_type,
    GREATEST(last_heartbeat, isolated_at, agent_state_changed_at) AS problem_since
FROM agents
WHERE archived_at IS NULL
  AND (is_isolated OR agent_state = 'safe_mode' OR last_heartbeat < (now() - '00:15:00'::interval))
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

GRANT SELECT ON public.v_problematic_agents TO authenticated;
