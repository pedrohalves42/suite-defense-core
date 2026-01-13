-- =============================================================================
-- Migration: Fix SQL function return types and add 'autonomous' to constraint
-- Fixes: 
--   1. detect_silent_job_failures() - hours_since_execution type
--   2. detect_throttle_revert_candidates() - pending_jobs type  
--   3. check_offline_agents_for_playbook() - minutes_offline type
--   4. decision_events constraint - add 'autonomous' value
-- =============================================================================

-- Phase 1.1: Fix detect_silent_job_failures - CAST to double precision
DROP FUNCTION IF EXISTS public.detect_silent_job_failures();
CREATE FUNCTION public.detect_silent_job_failures()
RETURNS TABLE(
  job_id UUID,
  tenant_id UUID,
  agent_id UUID,
  job_name TEXT,
  job_type TEXT,
  last_status TEXT,
  last_execution_at TIMESTAMPTZ,
  hours_since_execution DOUBLE PRECISION,
  violation_type TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id,
    j.tenant_id,
    j.agent_id,
    COALESCE(j.agent_name, j.type)::TEXT,
    j.type::TEXT,
    j.status::TEXT,
    j.completed_at,
    (EXTRACT(EPOCH FROM (NOW() - j.completed_at)) / 3600)::double precision,
    'silent_failure'::TEXT
  FROM jobs j
  WHERE j.status = 'completed'
    AND j.completed_at > NOW() - INTERVAL '24 hours'
    AND (j.output IS NULL OR j.output = '{}'::jsonb OR j.output = 'null'::jsonb)
    AND j.type NOT IN ('heartbeat', 'ping', 'status_check')
    AND NOT EXISTS (
      SELECT 1 FROM system_alerts sa
      WHERE sa.tenant_id = j.tenant_id
        AND sa.alert_type = 'silent_job_failure'
        AND sa.details->>'job_id' = j.id::text
        AND sa.created_at > NOW() - INTERVAL '4 hours'
    );
END;
$$;

-- Phase 1.2: Fix detect_throttle_revert_candidates - pending_jobs as INTEGER
DROP FUNCTION IF EXISTS public.detect_throttle_revert_candidates();
CREATE FUNCTION public.detect_throttle_revert_candidates()
RETURNS TABLE(
  agent_id UUID, 
  agent_name TEXT, 
  tenant_id UUID, 
  throttled_at TIMESTAMPTZ, 
  minutes_since_execution DOUBLE PRECISION,
  pending_jobs INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.agent_name::TEXT,
    a.tenant_id,
    a.throttled_at,
    v.minutes_since_execution::double precision,
    v.pending_jobs::INTEGER
  FROM agents a
  JOIN v_agent_execution_health v ON v.agent_id = a.id
  WHERE a.is_throttled = true
    AND a.throttled_at < NOW() - INTERVAL '2 hours'
    AND v.minutes_since_execution < 15
    AND v.pending_jobs < 5
    AND NOT EXISTS (
      SELECT 1 FROM decision_events de
      WHERE de.agent_id = a.id
        AND de.rule_code = 'AGENT_IMPRODUTIVE_005'
        AND de.created_at > NOW() - INTERVAL '2 hours'
    )
    AND v.health_status != 'safe_mode';
END;
$$;

-- Phase 1.3: Fix check_offline_agents_for_playbook (no params) - CAST to double precision
DROP FUNCTION IF EXISTS public.check_offline_agents_for_playbook();
CREATE FUNCTION public.check_offline_agents_for_playbook()
RETURNS TABLE(
  agent_id UUID,
  tenant_id UUID,
  agent_name TEXT,
  last_heartbeat TIMESTAMPTZ,
  minutes_offline DOUBLE PRECISION,
  playbook_triggered BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.tenant_id,
    a.agent_name::TEXT,
    a.last_heartbeat,
    (EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) / 60.0)::double precision,
    false
  FROM agents a
  WHERE a.status = 'active'
    AND a.last_heartbeat < NOW() - INTERVAL '15 minutes'
    AND a.archived_at IS NULL;
END;
$$;

-- Phase 2: Add 'autonomous' to decision_events constraint
ALTER TABLE decision_events 
DROP CONSTRAINT IF EXISTS decision_events_decision_type_check;

ALTER TABLE decision_events 
ADD CONSTRAINT decision_events_decision_type_check 
CHECK (
  decision_type IS NULL OR 
  decision_type = ANY (ARRAY[
    'approval', 'rejection', 'escalation', 'system',
    'alert_resolution', 'alert_reopen', 'compensating_action',
    'rollback', 'safe_mode_release', 'validation',
    'policy_validation', 'ai_model_promotion',
    'autonomous'
  ])
);

-- Phase 3: Sync check_offline_agents_for_playbook with parameter
DROP FUNCTION IF EXISTS public.check_offline_agents_for_playbook(uuid);
CREATE FUNCTION public.check_offline_agents_for_playbook(p_tenant_id UUID)
RETURNS TABLE(
  agent_id UUID,
  agent_name TEXT,
  last_heartbeat TIMESTAMPTZ,
  minutes_offline DOUBLE PRECISION
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.agent_name::TEXT,
    a.last_heartbeat,
    (EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) / 60.0)::double precision
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
    AND a.status = 'active'
    AND a.last_heartbeat < NOW() - INTERVAL '15 minutes'
    AND a.archived_at IS NULL;
END;
$$;