-- ============================================================================
-- PHASE 1: Fix detect_silent_job_failures() - use 'output' instead of 'result'
-- ============================================================================
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

-- ============================================================================
-- PHASE 2: Fix detect_throttle_revert_candidates() - align return types
-- ============================================================================
DROP FUNCTION IF EXISTS public.detect_throttle_revert_candidates();

CREATE FUNCTION public.detect_throttle_revert_candidates()
RETURNS TABLE(
  agent_id uuid, 
  agent_name text, 
  tenant_id uuid, 
  throttled_at timestamp with time zone, 
  minutes_since_execution double precision,
  pending_jobs bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS agent_id,
    a.agent_name,
    a.tenant_id,
    a.throttled_at,
    v.minutes_since_execution::double precision,
    v.pending_jobs
  FROM agents a
  JOIN v_agent_execution_health v ON v.agent_id = a.id
  WHERE
    a.is_throttled = true
    AND a.throttled_at < NOW() - INTERVAL '2 hours'
    AND v.minutes_since_execution < 15
    AND v.pending_jobs < 5
    AND NOT EXISTS (
      SELECT 1
      FROM decision_events de
      WHERE de.agent_id = a.id
        AND de.rule_code = 'AGENT_IMPRODUTIVE_005'
        AND de.created_at > NOW() - INTERVAL '2 hours'
    )
    AND v.health_status != 'safe_mode';
END;
$$;

-- ============================================================================
-- PHASE 3: Sync check_offline_agents_for_playbook() - align signatures
-- ============================================================================
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
    EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) / 60.0 as minutes_offline,
    false as playbook_triggered
  FROM agents a
  WHERE a.status = 'active'
    AND a.last_heartbeat < NOW() - INTERVAL '15 minutes'
    AND a.archived_at IS NULL;
END;
$$;

-- ============================================================================
-- PHASE 4: Add public RLS policy for agent_releases (active only)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'agent_releases' 
    AND policyname = 'agent_releases_select_public_active'
  ) THEN
    CREATE POLICY agent_releases_select_public_active ON agent_releases
      FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

-- ============================================================================
-- PHASE 5: Add performance indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_status_completed_at 
ON jobs(status, completed_at DESC) 
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_agents_throttled 
ON agents(is_throttled, throttled_at) 
WHERE is_throttled = true;