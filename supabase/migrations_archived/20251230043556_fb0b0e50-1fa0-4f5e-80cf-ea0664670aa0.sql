-- ============================================
-- MIGRATION: Jobs Health + Agent States + Audit Compliance
-- ============================================

-- =============================================
-- PHASE 1: Jobs Health Dashboard - View for metrics by type
-- =============================================
CREATE OR REPLACE VIEW v_job_metrics_by_type AS
SELECT 
  tenant_id,
  type,
  COUNT(*) as total_jobs,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'queued') as queued,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE status = 'delivered' 
    AND delivered_at < NOW() - INTERVAL '1 hour') as stuck,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))::numeric, 2) as avg_execution_seconds,
  ROUND((COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
    NULLIF(COUNT(*), 0) * 100), 1) as success_rate_pct
FROM jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tenant_id, type;

-- View for hourly job trends
CREATE OR REPLACE VIEW v_job_hourly_trends AS
SELECT 
  tenant_id,
  date_trunc('hour', created_at) as hour,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND((COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
    NULLIF(COUNT(*), 0) * 100), 1) as success_rate_pct
FROM jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tenant_id, date_trunc('hour', created_at)
ORDER BY hour DESC;

-- =============================================
-- PHASE 2: Semantic Agent States
-- =============================================
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS offline_reason TEXT,
ADD COLUMN IF NOT EXISTS offline_detected_at TIMESTAMP WITH TIME ZONE;

-- Comment for documentation
COMMENT ON COLUMN agents.offline_reason IS 'Reason for offline status: shutdown, network_unreachable, agent_crash, version_incompatible, unknown';

-- Function to set offline reason when agent goes offline
CREATE OR REPLACE FUNCTION detect_agent_offline_reason()
RETURNS TRIGGER AS $$
BEGIN
  -- If heartbeat becomes stale (>5 min gap), set offline reason
  IF OLD.last_heartbeat IS NOT NULL AND NEW.last_heartbeat = OLD.last_heartbeat THEN
    -- Heartbeat not updated, check if we need to set offline reason
    IF NEW.offline_reason IS NULL AND OLD.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN
      NEW.offline_reason := 'network_unreachable';
      NEW.offline_detected_at := NOW();
    END IF;
  END IF;
  
  -- If heartbeat was just updated, clear offline reason
  IF NEW.last_heartbeat IS DISTINCT FROM OLD.last_heartbeat AND NEW.last_heartbeat IS NOT NULL THEN
    NEW.offline_reason := NULL;
    NEW.offline_detected_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for offline detection (only if not exists)
DROP TRIGGER IF EXISTS trg_detect_agent_offline ON agents;
CREATE TRIGGER trg_detect_agent_offline
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION detect_agent_offline_reason();

-- =============================================
-- PHASE 3: Compliance-Grade Auditing
-- =============================================
ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS request_id UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS state_before JSONB,
ADD COLUMN IF NOT EXISTS state_after JSONB,
ADD COLUMN IF NOT EXISTS integrity_hash TEXT,
ADD COLUMN IF NOT EXISTS previous_log_hash TEXT;

-- Index for request_id correlation
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);

-- Function to calculate integrity hash chain
CREATE OR REPLACE FUNCTION calculate_audit_log_hash()
RETURNS TRIGGER AS $$
DECLARE
  v_previous_hash TEXT;
BEGIN
  -- Get hash of previous log for this tenant
  SELECT integrity_hash INTO v_previous_hash
  FROM audit_logs
  WHERE tenant_id = NEW.tenant_id
    AND id != NEW.id
  ORDER BY created_at DESC
  LIMIT 1;
  
  NEW.previous_log_hash := v_previous_hash;
  
  -- Calculate integrity hash including all relevant fields
  NEW.integrity_hash := encode(sha256(
    convert_to(
      COALESCE(v_previous_hash, 'genesis') || 
      NEW.id::text || 
      COALESCE(NEW.action, '') || 
      COALESCE(NEW.resource_type, '') ||
      COALESCE(NEW.resource_id, '') ||
      COALESCE(NEW.state_before::text, '{}') ||
      COALESCE(NEW.state_after::text, '{}') ||
      COALESCE(NEW.created_at::text, ''),
      'UTF8'
    )
  ), 'hex');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for hash chain (only on insert)
DROP TRIGGER IF EXISTS trg_audit_log_integrity ON audit_logs;
CREATE TRIGGER trg_audit_log_integrity
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION calculate_audit_log_hash();

-- RPC function for logging state changes with before/after
CREATE OR REPLACE FUNCTION log_state_change(
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_action TEXT,
  p_state_before JSONB DEFAULT NULL,
  p_state_after JSONB DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Get user's tenant
  SELECT tenant_id INTO v_tenant_id 
  FROM user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  -- Insert audit log entry with state tracking
  INSERT INTO audit_logs (
    user_id,
    tenant_id,
    action,
    resource_type,
    resource_id,
    state_before,
    state_after,
    request_id,
    details,
    success
  ) VALUES (
    auth.uid(),
    v_tenant_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_state_before,
    p_state_after,
    COALESCE(p_request_id, gen_random_uuid()),
    p_details || jsonb_build_object('logged_at', now()),
    true
  );
END;
$$;

-- Function to verify audit log chain integrity
CREATE OR REPLACE FUNCTION verify_audit_log_chain(
  p_tenant_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE(
  total_logs BIGINT,
  chain_valid BOOLEAN,
  first_broken_at TIMESTAMP WITH TIME ZONE,
  broken_log_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log RECORD;
  v_previous_hash TEXT := NULL;
  v_expected_hash TEXT;
  v_total BIGINT := 0;
  v_broken_at TIMESTAMP WITH TIME ZONE := NULL;
  v_broken_id UUID := NULL;
  v_chain_valid BOOLEAN := true;
BEGIN
  FOR v_log IN 
    SELECT * FROM audit_logs
    WHERE tenant_id = p_tenant_id
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date)
    ORDER BY created_at ASC
  LOOP
    v_total := v_total + 1;
    
    -- Skip first record (genesis)
    IF v_previous_hash IS NOT NULL THEN
      -- Verify chain
      IF v_log.previous_log_hash IS DISTINCT FROM v_previous_hash THEN
        v_chain_valid := false;
        v_broken_at := v_log.created_at;
        v_broken_id := v_log.id;
        EXIT;
      END IF;
    END IF;
    
    v_previous_hash := v_log.integrity_hash;
  END LOOP;
  
  RETURN QUERY SELECT v_total, v_chain_valid, v_broken_at, v_broken_id;
END;
$$;