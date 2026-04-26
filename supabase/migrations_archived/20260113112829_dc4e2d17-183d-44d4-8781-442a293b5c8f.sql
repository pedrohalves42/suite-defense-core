-- =============================================================================
-- PHASE 1: Fix SQL functions with non-existent column references
-- PHASE 3: Add default values for decision_source and decision_type
-- =============================================================================

-- =============================================================================
-- FIX 1.1: detect_silent_job_failures - DROP first then recreate
-- Was using j.name (should be agent_name) and j.executed_at (doesn't exist)
-- =============================================================================
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id as job_id,
    j.tenant_id,
    j.agent_id,
    COALESCE(j.agent_name, j.type) as job_name,
    j.type as job_type,
    j.status as last_status,
    j.completed_at as last_execution_at,
    EXTRACT(EPOCH FROM (NOW() - j.completed_at)) / 3600 as hours_since_execution,
    'silent_failure'::TEXT as violation_type
  FROM jobs j
  WHERE j.status = 'completed'
    AND j.completed_at > NOW() - INTERVAL '24 hours'
    AND j.completed_at IS NOT NULL
    AND (j.result IS NULL OR j.result = '{}'::jsonb OR j.result = 'null'::jsonb)
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

COMMENT ON FUNCTION public.detect_silent_job_failures() IS 
'Detects jobs marked as completed but without expected result data.';

-- =============================================================================
-- FIX 1.2: check_offline_agents_for_playbook (no params) - DROP first
-- Was using a.name (should be agent_name)
-- =============================================================================
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as agent_id,
    a.tenant_id,
    a.agent_name,
    a.last_heartbeat,
    EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) / 60 as minutes_offline,
    false as playbook_triggered
  FROM agents a
  WHERE a.status = 'active'
    AND a.last_heartbeat < NOW() - INTERVAL '15 minutes'
    AND a.archived_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.check_offline_agents_for_playbook() IS 
'Returns active agents that have been offline for more than 15 minutes.';

-- =============================================================================
-- PHASE 3: Add default values for decision_source and decision_type
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'decision_events' 
    AND column_name = 'decision_source'
  ) THEN
    ALTER TABLE decision_events ALTER COLUMN decision_source SET DEFAULT 'system';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'decision_events' 
    AND column_name = 'decision_type'
  ) THEN
    ALTER TABLE decision_events ALTER COLUMN decision_type SET DEFAULT 'autonomous';
  END IF;
END $$;