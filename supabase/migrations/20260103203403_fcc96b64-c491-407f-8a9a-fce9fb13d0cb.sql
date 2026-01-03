-- Drop existing function first
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid);

-- Recreate function with correct super_admin check (user_roles instead of profiles)
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_user_id uuid;
BEGIN
  -- Get user_id from auth context (for RLS compatibility when called from client)
  v_user_id := auth.uid();
  
  -- Check if user has access to this tenant (super_admin or belongs to tenant)
  -- FIXED: Check super_admin in user_roles table, not profiles
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = v_user_id 
    AND ur.tenant_id = p_tenant_id
  ) AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = v_user_id 
    AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Access denied to tenant metrics';
  END IF;

  SELECT jsonb_build_object(
    -- Agent metrics
    'total_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL),
    'online_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND status = 'active'),
    'offline_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND status != 'active'),
    'agents_in_safe_mode', (SELECT COUNT(*) FROM agent_safe_mode_events WHERE tenant_id = p_tenant_id AND resolved_at IS NULL),
    
    -- Execution metrics (last 24h) - using jobs table
    'total_executions_24h', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours'),
    'successful_executions_24h', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours' AND status = 'completed'),
    'failed_executions_24h', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours' AND status = 'failed'),
    
    -- Policy metrics
    'total_policies', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id),
    'active_policies', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true),
    
    -- Audit log metrics (last 7 days)
    'audit_logs_7d', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '7 days'),
    'sensitive_access_logs', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '7 days' AND action = 'sensitive_access'),
    'failed_actions', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '7 days' AND success = false),
    
    -- User metrics
    'total_users', (SELECT COUNT(*) FROM user_roles WHERE tenant_id = p_tenant_id),
    
    -- Alert metrics - using system_alerts table
    'open_alerts', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false),
    'critical_alerts', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false AND severity = 'critical'),
    
    -- Group metrics
    'total_groups', (SELECT COUNT(*) FROM agent_groups WHERE tenant_id = p_tenant_id),
    
    -- Rollback events (last 30 days)
    'rollback_events_30d', (SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days'),
    
    -- Evidence logs (last 7 days)
    'evidence_logs_7d', (SELECT COUNT(*) FROM agent_evidence_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '7 days')
  ) INTO result;

  RETURN result;
END;
$$;