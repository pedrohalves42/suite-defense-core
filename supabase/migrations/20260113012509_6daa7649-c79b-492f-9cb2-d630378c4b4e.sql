-- =============================================================================
-- Phase 2-4 Combined Migration: Fix RLS, Constraints, Function Types
-- =============================================================================

-- Phase 2: Fix agent_releases RLS policy for authenticated users
DROP POLICY IF EXISTS "agent_releases_select_authenticated" ON public.agent_releases;
DROP POLICY IF EXISTS "agent_releases_select_active_tenant" ON public.agent_releases;

CREATE POLICY "agent_releases_select_active"
  ON public.agent_releases FOR SELECT
  USING (
    is_active = true 
    AND (
      (SELECT get_active_tenant_id()) IS NOT NULL 
      OR (SELECT is_current_super_admin())
    )
  );

-- Phase 3: Expand ai_insights severity constraint to accept more values
ALTER TABLE public.ai_insights DROP CONSTRAINT IF EXISTS ai_insights_severity_check;
ALTER TABLE public.ai_insights ADD CONSTRAINT ai_insights_severity_check 
  CHECK (severity IN ('info', 'low', 'medium', 'warning', 'high', 'critical'));

-- Phase 4: Fix detect_improdutive_agents function - DROP first then recreate
DROP FUNCTION IF EXISTS public.detect_improdutive_agents();

CREATE FUNCTION public.detect_improdutive_agents()
RETURNS TABLE(
  agent_id uuid, 
  agent_name text, 
  tenant_id uuid, 
  health_status text, 
  minutes_since_heartbeat integer,
  minutes_since_execution integer,
  stale_queued_jobs bigint, 
  pending_jobs bigint
) 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.agent_id,
    v.agent_name,
    v.tenant_id,
    v.health_status,
    v.minutes_since_heartbeat::integer,
    v.minutes_since_execution::integer,
    v.stale_queued_jobs::bigint,
    v.pending_jobs::bigint
  FROM v_agent_execution_health v
  JOIN active_agents a ON a.id = v.agent_id
  WHERE v.health_status IN ('not_polling_jobs', 'not_executing_jobs', 'execution_stale')
    AND v.minutes_since_heartbeat < 30
    AND COALESCE(a.is_throttled, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM decision_events de
      WHERE de.agent_id = v.agent_id
        AND de.rule_code = 'AGENT_IMPRODUTIVE_005'
        AND de.created_at > NOW() - INTERVAL '2 hours'
    )
    AND v.health_status != 'safe_mode'
    AND (
      v.stale_queued_jobs >= 3
      OR v.minutes_since_execution > 120
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.detect_improdutive_agents() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.detect_improdutive_agents() IS 
'Detects agents that are online but not processing jobs. Returns integer types for minutes columns to match v_agent_execution_health view.';