-- =============================================================================
-- Fix: detect_silent_job_failures() - Remove reference to non-existent reference_id
-- Fix: Create wrapper check_offline_agents_for_playbook() without parameters
-- =============================================================================

-- Drop and recreate detect_silent_job_failures without reference_id
DROP FUNCTION IF EXISTS public.detect_silent_job_failures();

CREATE OR REPLACE FUNCTION public.detect_silent_job_failures()
RETURNS TABLE(
  job_id uuid,
  tenant_id uuid,
  agent_id uuid,
  job_name text,
  last_status text,
  last_execution_at timestamptz,
  hours_since_execution numeric
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
    j.name as job_name,
    j.status as last_status,
    j.executed_at as last_execution_at,
    EXTRACT(EPOCH FROM (NOW() - j.executed_at)) / 3600 as hours_since_execution
  FROM jobs j
  WHERE j.status = 'failed'
    AND j.executed_at > NOW() - INTERVAL '24 hours'
    AND NOT EXISTS (
      -- Check if alert already exists using details JSONB instead of reference_id
      SELECT 1 FROM system_alerts sa
      WHERE sa.tenant_id = j.tenant_id
        AND sa.alert_type = 'silent_job_failure'
        AND sa.details->>'job_id' = j.id::text
        AND sa.created_at > NOW() - INTERVAL '4 hours'
    );
END;
$$;

-- Create wrapper for check_offline_agents_for_playbook without parameters
-- This provides backward compatibility for CRON jobs that call without tenant_id
CREATE OR REPLACE FUNCTION public.check_offline_agents_for_playbook()
RETURNS TABLE(
  agent_id uuid,
  tenant_id uuid,
  agent_name text,
  last_heartbeat timestamptz,
  minutes_offline numeric,
  playbook_triggered boolean
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
    a.name as agent_name,
    a.last_heartbeat,
    EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) / 60 as minutes_offline,
    false as playbook_triggered
  FROM agents a
  WHERE a.status = 'active'
    AND a.last_heartbeat < NOW() - INTERVAL '15 minutes'
    AND a.archived_at IS NULL;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION public.detect_silent_job_failures() IS 
'Detects failed jobs without corresponding alerts. Uses details JSONB for alert matching.';

COMMENT ON FUNCTION public.check_offline_agents_for_playbook() IS 
'Wrapper without parameters for backward compatibility. Returns offline agents across all tenants.';