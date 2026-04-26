-- =============================================================================
-- Migration: Complete System Fix - Phases 1, 5, 6 (Fixed)
-- =============================================================================

-- Phase 1: Fix agent_releases RLS - ensure public can read active releases
DROP POLICY IF EXISTS agent_releases_public_read ON agent_releases;
DROP POLICY IF EXISTS agent_releases_select_public_active ON agent_releases;

CREATE POLICY agent_releases_public_read ON agent_releases
FOR SELECT 
USING (is_active = true);

-- Phase 5: Fix tenant_id resolution - create helper function
CREATE OR REPLACE FUNCTION public.get_user_tenant_id_safe(p_user_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_check_user_id UUID;
BEGIN
  v_check_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_check_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT tenant_id INTO v_tenant_id
  FROM profiles
  WHERE user_id = v_check_user_id
  LIMIT 1;
  
  IF v_tenant_id IS NOT NULL THEN
    RETURN v_tenant_id;
  END IF;
  
  SELECT tenant_id INTO v_tenant_id
  FROM tenant_users
  WHERE user_id = v_check_user_id
  LIMIT 1;
  
  RETURN v_tenant_id;
END;
$$;

-- Phase 6: Add performance indexes (without NOW() - must be immutable)
-- Index for jobs by completed_at (query will filter by date)
CREATE INDEX IF NOT EXISTS idx_jobs_completed_status 
ON jobs (status, completed_at DESC);

-- Index for agent heartbeat queries
CREATE INDEX IF NOT EXISTS idx_agents_heartbeat_active 
ON agents (last_heartbeat DESC) 
WHERE status = 'active' AND archived_at IS NULL;

-- Index for system_alerts deduplication
CREATE INDEX IF NOT EXISTS idx_system_alerts_dedup 
ON system_alerts (tenant_id, alert_type, created_at DESC);

-- Index for decision_events lookups
CREATE INDEX IF NOT EXISTS idx_decision_events_agent_rule 
ON decision_events (agent_id, rule_code, created_at DESC);

-- Index for agent_tokens validation
CREATE INDEX IF NOT EXISTS idx_agent_tokens_hash_active 
ON agent_tokens (token_hash) 
WHERE is_active = true;

-- Index for ai_insights recent queries
CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant_recent 
ON ai_insights (tenant_id, created_at DESC);

-- Analyze tables to update statistics
ANALYZE jobs;
ANALYZE agents;
ANALYZE system_alerts;
ANALYZE decision_events;
ANALYZE agent_tokens;
ANALYZE ai_insights;