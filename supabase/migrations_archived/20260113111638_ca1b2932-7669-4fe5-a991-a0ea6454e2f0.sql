-- =============================================================================
-- Phase 2: Optimize slow queries with composite indexes
-- Phase 4: Data retention function for agent_evidence_logs
-- =============================================================================

-- Create composite indexes for agent_evidence_logs
CREATE INDEX IF NOT EXISTS idx_evidence_logs_tenant_created 
ON agent_evidence_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_logs_agent_type 
ON agent_evidence_logs(agent_id, event_type);

-- Create composite index for system_alerts (used by detect_silent_job_failures)
CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_type_created 
ON system_alerts(tenant_id, alert_type, created_at DESC);

-- Create index for jobs table (using completed_at which exists)
CREATE INDEX IF NOT EXISTS idx_jobs_status_completed 
ON jobs(status, completed_at DESC) WHERE status = 'failed';

-- =============================================================================
-- Data retention function for old evidence logs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.archive_old_evidence_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  DELETE FROM agent_evidence_logs 
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  
  RETURN archived_count;
END;
$$;

COMMENT ON FUNCTION public.archive_old_evidence_logs(INTEGER) IS 
'Archives evidence logs older than specified days (default 90). Returns count of deleted rows.';