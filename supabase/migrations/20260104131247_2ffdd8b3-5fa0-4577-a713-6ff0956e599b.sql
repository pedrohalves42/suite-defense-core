-- Fix get_audit_raw_metrics to use EXISTING tables only
-- Version 2.1.0 - Removes references to non-existent tables:
-- - command_executions -> use jobs instead
-- - ai_action_proposals -> use ai_actions instead  
-- - dlq_events -> use failed_jobs_dlq instead

CREATE OR REPLACE FUNCTION get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    -- AGENTS
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
      'by_system', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND actor_type = 'system'), 0),
      'human_rate', CASE 
        WHEN (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id) > 0 
        THEN ROUND((SELECT COUNT(*)::numeric FROM decision_events WHERE tenant_id = p_tenant_id AND actor_type = 'human') * 100 
             / (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id), 2)
        ELSE 0
      END
    ),
    
    -- AI ACTIONS (correct table: ai_actions)
    'ai_actions', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0),
      'human_reviewed', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND human_reviewed = true), 0),
      'approved', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision = 'approved'), 0),
      'rejected', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision = 'rejected'), 0),
      'pending', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision IS NULL), 0),
      'approval_rate', CASE 
        WHEN (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id) = 0 THEN 100
        ELSE ROUND(
          (SELECT COUNT(*)::numeric FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision = 'approved') * 100 
          / NULLIF((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0), 2)
      END
    ),
    
    -- DLQ (correct table: failed_jobs_dlq)
    'dlq', jsonb_build_object(
      'current', COALESCE((SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND status = 'pending'), 0),
      'total', COALESCE((SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id), 0),
      'resolution_rate', CASE 
        WHEN (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id) = 0 THEN 100
        ELSE ROUND(
          (SELECT COUNT(*)::numeric FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND status IN ('resolved', 'completed')) * 100 
          / NULLIF((SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id), 0), 2)
      END
    ),
    
    -- ROLLBACKS
    'rollbacks', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id), 0),
      'last_30d', COALESCE((SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days'), 0)
    ),
    
    -- ALERTS
    'alerts', jsonb_build_object(
      'open', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false),
      'critical_open', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false AND severity = 'critical')
    ),
    
    -- USERS
    'users', jsonb_build_object(
      'count', (SELECT COUNT(DISTINCT user_id) FROM user_roles WHERE tenant_id = p_tenant_id)
    ),
    
    -- POLICIES
    'policies', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id),
      'active', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true)
    ),
    
    -- TENANT ISOLATION (existing view)
    'tenant_isolation', COALESCE(
      (SELECT row_to_json(v)::jsonb FROM v_tenant_isolation_metrics v WHERE v.tenant_id = p_tenant_id),
      '{"rls_coverage_percent": 100}'::jsonb
    ),
    
    -- RBAC (existing view)
    'rbac', COALESCE(
      (SELECT row_to_json(v)::jsonb FROM v_rbac_metrics v WHERE v.tenant_id = p_tenant_id),
      '{"total_users": 0}'::jsonb
    ),
    
    -- ENFORCEMENT (existing view)
    'enforcement', COALESCE(
      (SELECT row_to_json(v)::jsonb FROM v_enforcement_compliance v WHERE v.tenant_id = p_tenant_id),
      '{"compliance_score": 100}'::jsonb
    ),
    
    -- HUMAN OVERSIGHT (aggregated)
    'human_oversight', jsonb_build_object(
      'ai_actions_reviewed', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND human_reviewed = true), 0),
      'ai_actions_total', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0),
      'review_rate', CASE 
        WHEN (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id) = 0 THEN 100
        ELSE ROUND(
          (SELECT COUNT(*)::numeric FROM ai_actions WHERE tenant_id = p_tenant_id AND human_reviewed = true) * 100 
          / NULLIF((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0), 2)
      END
    ),
    
    -- EXECUTIONS (using jobs table, not command_executions)
    'total_executions_24h', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours'),
    'successful_executions_24h', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours' AND status = 'completed'),
    'failed_executions_24h', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours' AND status = 'failed'),
    
    -- METADATA
    'collected_at', NOW(),
    'version', '2.1.0'
    
  ) INTO result;

  RETURN result;
END;
$$;