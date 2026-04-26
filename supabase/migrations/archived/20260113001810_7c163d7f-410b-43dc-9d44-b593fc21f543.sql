-- =============================================================================
-- Phase 1.2: Create detect_silent_job_failures function
-- =============================================================================
-- This fixes the SILENT_FAILURE_007 AI rule that was completely failing
-- =============================================================================

CREATE OR REPLACE FUNCTION public.detect_silent_job_failures()
RETURNS TABLE(
  job_id uuid,
  job_type text,
  agent_id uuid,
  agent_name text,
  tenant_id uuid,
  finished_at timestamptz,
  failure_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id as job_id,
    j.type as job_type,
    j.agent_id,
    a.agent_name,
    j.tenant_id,
    j.completed_at as finished_at,
    CASE
      WHEN je.id IS NULL THEN 'No execution record found'
      WHEN je.status = 'failed' AND je.error_message IS NULL THEN 'Failed without error message'
      WHEN je.exit_code IS NOT NULL AND je.exit_code != 0 AND je.error_message IS NULL THEN 'Non-zero exit code without error'
      ELSE 'Completed without expected output'
    END as failure_reason
  FROM jobs j
  JOIN agents a ON a.id = j.agent_id
  LEFT JOIN job_executions je ON je.job_id = j.id
  WHERE j.status = 'completed'
    AND j.completed_at > NOW() - INTERVAL '24 hours'
    AND (
      je.id IS NULL 
      OR (je.status = 'failed' AND je.error_message IS NULL)
      OR (je.exit_code IS NOT NULL AND je.exit_code != 0 AND je.error_message IS NULL)
    )
    AND j.type NOT IN ('heartbeat', 'ping', 'status_check')
    AND NOT EXISTS (
      SELECT 1 FROM system_alerts sa
      WHERE sa.reference_id = j.id::text
        AND sa.alert_type = 'silent_job_failure'
        AND sa.created_at > NOW() - INTERVAL '4 hours'
    );
END;
$$;

COMMENT ON FUNCTION public.detect_silent_job_failures() IS 
'Detects jobs that completed but have suspicious execution patterns: missing execution records, failed without error messages, or non-zero exit codes without explanations. Used by SILENT_FAILURE_007 AI rule.';