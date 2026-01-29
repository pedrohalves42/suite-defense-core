-- =============================================================
-- FIX: Rewrite get_audit_raw_metrics to query base tables directly
-- Avoids "more than one row returned" errors from problematic views
-- =============================================================

DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid);

CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    -- AGENTS (direct query - safe)
    'agents', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL),
      'online', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND status = 'active'),
      'offline', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND status != 'active'),
      'in_safe_mode', (SELECT COUNT(*) FROM agent_safe_mode_events WHERE tenant_id = p_tenant_id AND resolved_at IS NULL)
    ),
    
    -- DECISION EVENTS
    'decision_events', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id), 0),
      'by_human', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND actor_type = 'human'), 0),
      'by_system', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND actor_type = 'system'), 0)
    ),
    
    -- AI ACTIONS
    'ai_actions', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0),
      'human_reviewed', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND human_reviewed = true), 0),
      'approved', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision = 'approved'), 0),
      'pending', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision IS NULL), 0)
    ),
    
    -- DLQ
    'dlq', jsonb_build_object(
      'current', COALESCE((SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND status = 'pending'), 0),
      'total', COALESCE((SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id), 0)
    ),
    
    -- ROLLBACKS
    'rollbacks', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id), 0),
      'last_30d', COALESCE((SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days'), 0)
    ),
    
    -- ALERTS
    'alerts', jsonb_build_object(
      'open', COALESCE((SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false), 0),
      'critical_open', COALESCE((SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false AND severity = 'critical'), 0)
    ),
    
    -- USERS
    'users', jsonb_build_object(
      'count', COALESCE((SELECT COUNT(DISTINCT user_id) FROM user_roles WHERE tenant_id = p_tenant_id), 0)
    ),
    
    -- POLICIES
    'policies', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id), 0),
      'active', COALESCE((SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true), 0)
    ),
    
    -- TENANT STATS (replacing v_tenant_isolation_metrics)
    'tenant_stats', jsonb_build_object(
      'agent_count', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL),
      'job_count', COALESCE((SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id), 0),
      'user_count', COALESCE((SELECT COUNT(DISTINCT user_id) FROM user_roles WHERE tenant_id = p_tenant_id), 0)
    ),
    
    -- METADATA
    'collected_at', NOW(),
    'version', '3.0.0'
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_audit_raw_metrics(uuid) TO authenticated;

-- =============================================================
-- FIX: Add RLS policies for agent_tokens 
-- =============================================================

-- Enable RLS if not already enabled
ALTER TABLE public.agent_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists to avoid conflicts
DROP POLICY IF EXISTS "Users can view tokens for agents in their tenant" ON public.agent_tokens;

-- Create SELECT policy for authenticated users
CREATE POLICY "Users can view tokens for agents in their tenant"
ON public.agent_tokens FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM agents a
    JOIN user_roles ur ON ur.tenant_id = a.tenant_id
    WHERE a.id = agent_tokens.agent_id
    AND ur.user_id = auth.uid()
  )
);

-- =============================================================
-- FIX: Add RLS policy for agent_releases (global table - all authenticated can read active)
-- =============================================================

-- Enable RLS if not already enabled
ALTER TABLE public.agent_releases ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Authenticated users can view active releases" ON public.agent_releases;

-- Create SELECT policy - releases are global, not tenant-scoped
CREATE POLICY "Authenticated users can view active releases"
ON public.agent_releases FOR SELECT
TO authenticated
USING (is_active = true);