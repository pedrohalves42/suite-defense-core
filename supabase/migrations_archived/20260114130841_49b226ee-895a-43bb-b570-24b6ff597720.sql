-- ============================================================================
-- Fix active_agents view to include missing columns needed by functions
-- ============================================================================
-- Issue: get_agent_health_metrics and other functions use active_agents.is_throttled
-- but the view doesn't include that column

DROP VIEW IF EXISTS public.active_agents CASCADE;
CREATE OR REPLACE VIEW public.active_agents
WITH (security_invoker = true) AS
SELECT 
  id,
  tenant_id,
  agent_name,
  hostname,
  status,
  os_type,
  os_version,
  agent_version,
  display_name,
  enrolled_at,
  last_heartbeat,
  agent_mode,
  agent_state,
  agent_state_reason,
  -- Add missing columns used by functions
  is_throttled,
  throttle_reason,
  throttled_at,
  is_isolated,
  isolation_reason,
  isolated_at,
  safe_mode_entered_at,
  safe_mode_reason
FROM public.agents
WHERE status = 'active'
  AND archived_at IS NULL
  AND (
    tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

COMMENT ON VIEW public.active_agents IS 'Active non-archived agents with full tenant filtering - ADR-024';
GRANT SELECT ON public.active_agents TO authenticated;