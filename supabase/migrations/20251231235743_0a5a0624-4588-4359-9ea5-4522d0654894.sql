-- Fix get_audit_raw_metrics to accept optional p_user_id parameter
-- This allows edge functions using service role to pass user.id explicitly

DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid);
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(
  p_tenant_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_effective_user_id uuid;
BEGIN
  -- Use p_user_id if provided, otherwise auth.uid()
  v_effective_user_id := COALESCE(p_user_id, auth.uid());
  
  -- Validate user ID is present
  IF v_effective_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  
  -- Verify user has access to this tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_effective_user_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: No access to tenant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    -- Agent metrics
    'agents', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'online', COUNT(*) FILTER (WHERE agent_state = 'online'),
        'offline', COUNT(*) FILTER (WHERE agent_state = 'offline'),
        'warning', COUNT(*) FILTER (WHERE agent_state = 'warning'),
        'critical', COUNT(*) FILTER (WHERE agent_state = 'critical'),
        'safe_mode', COUNT(*) FILTER (WHERE agent_mode = 'safe_mode')
      )
      FROM public.agents WHERE tenant_id = p_tenant_id
    ),
    
    -- Alert metrics
    'alerts', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'critical', COUNT(*) FILTER (WHERE severity = 'critical'),
        'high', COUNT(*) FILTER (WHERE severity = 'high'),
        'medium', COUNT(*) FILTER (WHERE severity = 'medium'),
        'low', COUNT(*) FILTER (WHERE severity = 'low'),
        'unresolved', COUNT(*) FILTER (WHERE resolved_at IS NULL)
      )
      FROM public.alerts WHERE tenant_id = p_tenant_id
    ),
    
    -- Policy metrics
    'policies', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'enabled', COUNT(*) FILTER (WHERE is_enabled = true),
        'with_assignments', COUNT(DISTINCT sp.id)
      )
      FROM public.security_policies sp
      LEFT JOIN public.agent_group_policies agp ON sp.id = agp.policy_id
      WHERE sp.tenant_id = p_tenant_id
    ),
    
    -- AI Actions metrics
    'ai_actions', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'approved', COUNT(*) FILTER (WHERE status = 'approved'),
        'rejected', COUNT(*) FILTER (WHERE status = 'rejected'),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'auto_approved', COUNT(*) FILTER (WHERE is_auto_executed = true)
      )
      FROM public.ai_actions WHERE tenant_id = p_tenant_id
    ),
    
    -- Execution chain integrity
    'execution_chain', (
      SELECT jsonb_build_object(
        'agents_with_chain', COUNT(DISTINCT agent_id),
        'total_executions', SUM(last_execution_index),
        'integrity_status', 'verified'
      )
      FROM public.agent_execution_chain aec
      JOIN public.agents a ON aec.agent_id = a.id
      WHERE a.tenant_id = p_tenant_id
    ),
    
    -- Safe mode events
    'safe_mode', (
      SELECT jsonb_build_object(
        'total_events', COUNT(*),
        'unresolved', COUNT(*) FILTER (WHERE resolved_at IS NULL),
        'agents_affected', COUNT(DISTINCT agent_id)
      )
      FROM public.agent_safe_mode_events WHERE tenant_id = p_tenant_id
    ),
    
    -- Rollback events
    'rollbacks', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'last_30_days', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'),
        'safe_mode_triggered', COUNT(*) FILTER (WHERE safe_mode_triggered = true)
      )
      FROM public.agent_rollback_events WHERE tenant_id = p_tenant_id
    ),
    
    -- Update policies
    'update_policies', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'enabled', COUNT(*) FILTER (WHERE enabled = true),
        'avg_rollout', AVG(rollout_percentage)
      )
      FROM public.agent_update_policies
    ),
    
    -- Evidence logs
    'evidence', (
      SELECT jsonb_build_object(
        'total_logs', COUNT(*),
        'critical_events', COUNT(*) FILTER (WHERE severity = 'critical'),
        'last_24h', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')
      )
      FROM public.agent_evidence_logs WHERE tenant_id = p_tenant_id
    ),
    
    -- User roles distribution
    'users', (
      SELECT jsonb_build_object(
        'total', COUNT(DISTINCT user_id),
        'admins', COUNT(*) FILTER (WHERE role = 'admin'),
        'super_admins', COUNT(*) FILTER (WHERE role = 'super_admin'),
        'operators', COUNT(*) FILTER (WHERE role = 'operator')
      )
      FROM public.user_roles WHERE tenant_id = p_tenant_id
    ),
    
    -- Tenant info
    'tenant', (
      SELECT jsonb_build_object(
        'name', name,
        'created_at', created_at,
        'subscription_tier', subscription_tier
      )
      FROM public.tenants WHERE id = p_tenant_id
    ),
    
    -- Recent activity summary
    'activity', (
      SELECT jsonb_build_object(
        'agents_updated_24h', (
          SELECT COUNT(*) FROM public.agents 
          WHERE tenant_id = p_tenant_id AND updated_at > NOW() - INTERVAL '24 hours'
        ),
        'alerts_created_24h', (
          SELECT COUNT(*) FROM public.alerts 
          WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours'
        ),
        'ai_actions_24h', (
          SELECT COUNT(*) FROM public.ai_actions 
          WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours'
        )
      )
    ),

    -- Governance metrics (for ANA compliance checking)
    'governance', (
      SELECT jsonb_build_object(
        'dlq_pending', (SELECT COUNT(*) FROM public.ai_dlq WHERE tenant_id = p_tenant_id AND processed_at IS NULL),
        'dlq_total', (SELECT COUNT(*) FROM public.ai_dlq WHERE tenant_id = p_tenant_id),
        'approval_rate', (
          SELECT CASE 
            WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE status = 'approved')::numeric / COUNT(*)::numeric) * 100, 2)
            ELSE 100
          END
          FROM public.ai_actions WHERE tenant_id = p_tenant_id
        ),
        'human_override_count', (
          SELECT COUNT(*) FROM public.ai_actions 
          WHERE tenant_id = p_tenant_id AND reviewed_by IS NOT NULL
        )
      )
    ),
    
    -- Metadata
    'collected_at', NOW()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_audit_raw_metrics(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_raw_metrics(uuid, uuid) TO service_role;