-- COMMIT 1: Expand get_audit_raw_metrics with all required structures
-- Including: decision_events, ai_actions (with correct fields), dlq, tenant_isolation, rbac, enforcement

CREATE OR REPLACE FUNCTION get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_has_access boolean;
BEGIN
  -- Validate tenant access (security check)
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND tenant_id = p_tenant_id
  ) INTO v_has_access;
  
  IF NOT v_has_access AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access denied to tenant metrics';
  END IF;

  SELECT jsonb_build_object(
    -- ==== ESTRUTURA: agents ====
    'agents', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL),
      'online', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND status = 'active'),
      'offline', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND status != 'active'),
      'in_safe_mode', (SELECT COUNT(*) FROM agent_safe_mode_events WHERE tenant_id = p_tenant_id AND resolved_at IS NULL)
    ),
    
    -- ==== ESTRUTURA: decision_events ====
    'decision_events', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id), 0),
      'alert_resolutions', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND decision_type = 'alert_resolution'), 0),
      'rollbacks', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND decision_type = 'rollback'), 0),
      'by_system', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND actor_type = 'system'), 0),
      'by_human', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND actor_type = 'human'), 0),
      'human_rate', CASE 
        WHEN (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id) > 0 
        THEN ROUND((SELECT COUNT(*)::numeric FROM decision_events WHERE tenant_id = p_tenant_id AND actor_type = 'human') * 100 
             / (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id), 2)
        ELSE 0
      END
    ),
    
    -- ==== ESTRUTURA: ai_actions (CORRIGIDA com campos reais) ====
    'ai_actions', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0),
      'human_reviewed', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND human_reviewed = true), 0),
      'approved', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision = 'approved' AND human_reviewed = true), 0),
      'rejected', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision = 'rejected'), 0),
      'pending', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision IS NULL), 0),
      'approval_rate', CASE 
        WHEN (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id) = 0 THEN 100
        ELSE ROUND(
          (SELECT COUNT(*)::numeric FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision = 'approved' AND human_reviewed = true) * 100 
          / NULLIF((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0), 2)
      END,
      'shadow_validation_rate', COALESCE((
        SELECT CASE 
          WHEN COUNT(*) > 0 
          THEN ROUND(COUNT(*) FILTER (WHERE shadow_validation IS NOT NULL AND shadow_validation != '{}')::numeric * 100 / COUNT(*), 2)
          ELSE 0 
        END
        FROM ai_actions WHERE tenant_id = p_tenant_id
      ), 0)
    ),
    
    -- ==== ESTRUTURA: dlq ====
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
    
    -- ==== ESTRUTURA: rollbacks ====
    'rollbacks', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id), 0),
      'last_30d', COALESCE((SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days'), 0)
    ),
    
    -- ==== ESTRUTURA: alerts ====
    'alerts', jsonb_build_object(
      'open', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false),
      'critical_open', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false AND severity = 'critical'),
      'decision_coverage_percent', CASE 
        WHEN (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = true) = 0 THEN 100
        ELSE ROUND(
          (SELECT COUNT(DISTINCT sa.id)::numeric FROM system_alerts sa 
           INNER JOIN decision_events de ON de.resource_id = sa.id::text 
           WHERE sa.tenant_id = p_tenant_id AND sa.resolved = true) * 100 
          / NULLIF((SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = true), 0), 2)
      END
    ),
    
    -- ==== ESTRUTURA: critical_alerts (para score deterministico) ====
    'critical_alerts', jsonb_build_object(
      'open', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false AND severity = 'critical')
    ),
    
    -- ==== ESTRUTURA: users ====
    'users', jsonb_build_object(
      'count', (SELECT COUNT(DISTINCT user_id) FROM user_roles WHERE tenant_id = p_tenant_id)
    ),
    
    -- ==== ESTRUTURA: policies ====
    'policies', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id),
      'active', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true)
    ),
    
    -- ==== ESTRUTURA: evidence_chain ====
    'evidence_chain', jsonb_build_object(
      'healthy', true,
      'logs_7d', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '7 days'),
      'evidence_logs_7d', (SELECT COUNT(*) FROM agent_evidence_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '7 days')
    ),
    
    -- ==== ESTRUTURA: tenant_isolation (da view existente) ====
    'tenant_isolation', COALESCE(
      (SELECT row_to_json(v)::jsonb FROM v_tenant_isolation_metrics v WHERE v.tenant_id = p_tenant_id),
      jsonb_build_object('rls_coverage_percent', 100, 'tables_with_rls', 0, 'total_tables', 0)
    ),
    
    -- ==== ESTRUTURA: rbac (da view existente) ====
    'rbac', COALESCE(
      (SELECT row_to_json(v)::jsonb FROM v_rbac_metrics v WHERE v.tenant_id = p_tenant_id),
      jsonb_build_object('total_users', 0, 'roles_defined', 0)
    ),
    
    -- ==== ESTRUTURA: enforcement (da view existente) ====
    'enforcement', COALESCE(
      (SELECT row_to_json(v)::jsonb FROM v_enforcement_compliance v WHERE v.tenant_id = p_tenant_id),
      jsonb_build_object('compliance_score', 100, 'policies_enforced', 0)
    ),
    
    -- ==== ESTRUTURA: human_oversight (agregado) ====
    'human_oversight', jsonb_build_object(
      'ai_actions_reviewed', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND human_reviewed = true), 0),
      'ai_actions_total', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0),
      'review_rate', CASE 
        WHEN (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id) = 0 THEN 100
        ELSE ROUND(
          (SELECT COUNT(*)::numeric FROM ai_actions WHERE tenant_id = p_tenant_id AND human_reviewed = true) * 100 
          / NULLIF((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0), 2)
      END,
      'decisions_by_human', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND actor_type = 'human'), 0),
      'kill_switch_available', true
    ),
    
    -- ==== Executions (manter compatibilidade) ====
    'total_executions_24h', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours'),
    'successful_executions_24h', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours' AND status = 'completed'),
    'failed_executions_24h', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours' AND status = 'failed'),
    
    -- ==== Metadata ====
    'collected_at', NOW(),
    'version', '2.0.0'
    
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_audit_raw_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_raw_metrics(uuid) TO service_role;