-- Drop existing function first (required when changing parameter defaults)
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid);
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid, uuid);

-- Recreate function with correct column names
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
  IF NOT EXISTS (
    SELECT 1 FROM user_tenants ut
    WHERE ut.user_id = v_user_id 
    AND ut.tenant_id = p_tenant_id
  ) AND NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = v_user_id 
    AND p.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Access denied to tenant metrics';
  END IF;

  SELECT jsonb_build_object(
    -- Agent metrics
    'total_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND is_archived = false),
    'online_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND is_archived = false AND status = 'online'),
    'offline_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND is_archived = false AND status = 'offline'),
    'agents_in_safe_mode', (SELECT COUNT(*) FROM agent_safe_mode_events WHERE tenant_id = p_tenant_id AND resolved_at IS NULL),
    
    -- Execution metrics (last 24h)
    'total_executions_24h', (SELECT COUNT(*) FROM job_executions WHERE tenant_id = p_tenant_id AND started_at > NOW() - INTERVAL '24 hours'),
    'successful_executions_24h', (SELECT COUNT(*) FROM job_executions WHERE tenant_id = p_tenant_id AND started_at > NOW() - INTERVAL '24 hours' AND status = 'success'),
    'failed_executions_24h', (SELECT COUNT(*) FROM job_executions WHERE tenant_id = p_tenant_id AND started_at > NOW() - INTERVAL '24 hours' AND status = 'failed'),
    
    -- Policy metrics
    'total_policies', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id),
    'active_policies', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true),
    
    -- Audit log metrics (last 7 days) - using correct column name 'action' instead of 'action_type'
    'audit_logs_7d', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '7 days'),
    'sensitive_access_logs', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '7 days' AND action = 'sensitive_access'),
    'failed_actions', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '7 days' AND success = false),
    
    -- User metrics
    'total_users', (SELECT COUNT(*) FROM user_tenants WHERE tenant_id = p_tenant_id),
    
    -- Alert metrics
    'open_alerts', (SELECT COUNT(*) FROM alerts WHERE tenant_id = p_tenant_id AND status = 'open'),
    'critical_alerts', (SELECT COUNT(*) FROM alerts WHERE tenant_id = p_tenant_id AND status = 'open' AND severity = 'critical'),
    
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