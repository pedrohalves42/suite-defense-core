-- Correcao: Substituir referencia a resource_id inexistente por agent_id
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'agents', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id),
      'active', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND status = 'active'),
      'inactive', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND status != 'active'),
      'safe_mode', (SELECT COUNT(*) FROM agent_safe_mode_events WHERE tenant_id = p_tenant_id AND resolved_at IS NULL),
      'with_signing_keys', (SELECT COUNT(DISTINCT agent_id) FROM agent_signing_keys WHERE revoked_at IS NULL)
    ),
    'executions', jsonb_build_object(
      'total_24h', (SELECT COUNT(*) FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours'),
      'approved', (SELECT COUNT(*) FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours' AND approval_status = 'approved'),
      'pending', (SELECT COUNT(*) FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours' AND approval_status = 'pending'),
      'rejected', (SELECT COUNT(*) FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours' AND approval_status = 'rejected'),
      'auto_approved', (SELECT COUNT(*) FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours' AND approval_status = 'auto_approved'),
      'failed', (SELECT COUNT(*) FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours' AND status = 'failed'),
      'approval_rate', CASE 
        WHEN (SELECT COUNT(*) FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours') = 0 THEN 100
        ELSE ROUND((SELECT COUNT(*)::numeric FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours' AND approval_status IN ('approved', 'auto_approved')) * 100 / NULLIF((SELECT COUNT(*) FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours'), 0), 2)
      END
    ),
    'decision_events', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id),
      'last_24h', (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours'),
      'human_reviewed', (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND human_reviewed = true),
      'human_review_rate', CASE 
        WHEN (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id) = 0 THEN NULL
        ELSE ROUND((SELECT COUNT(*)::numeric FROM decision_events WHERE tenant_id = p_tenant_id AND human_reviewed = true) * 100 / NULLIF((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id), 0), 2)
      END
    ),
    'ai_actions', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id),
      'human_reviewed', (SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id AND human_reviewed = true),
      'approved', (SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id AND status = 'approved'),
      'rejected', (SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id AND status = 'rejected'),
      'pending', (SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id AND status = 'pending'),
      'approval_rate', CASE 
        WHEN (SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id AND status IN ('approved', 'rejected')) = 0 THEN NULL
        ELSE ROUND((SELECT COUNT(*)::numeric FROM ai_action_proposals WHERE tenant_id = p_tenant_id AND status = 'approved') * 100 / NULLIF((SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id AND status IN ('approved', 'rejected')), 0), 2)
      END,
      'shadow_validation_rate', CASE 
        WHEN (SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id) = 0 THEN NULL
        ELSE ROUND((SELECT COUNT(*)::numeric FROM ai_action_proposals WHERE tenant_id = p_tenant_id AND shadow_validation_result IS NOT NULL) * 100 / NULLIF((SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id), 0), 2)
      END
    ),
    'dlq', jsonb_build_object(
      'current', (SELECT COUNT(*) FROM dlq_events WHERE tenant_id = p_tenant_id AND status = 'pending'),
      'total', (SELECT COUNT(*) FROM dlq_events WHERE tenant_id = p_tenant_id),
      'resolution_rate', CASE 
        WHEN (SELECT COUNT(*) FROM dlq_events WHERE tenant_id = p_tenant_id) = 0 THEN 100
        ELSE ROUND((SELECT COUNT(*)::numeric FROM dlq_events WHERE tenant_id = p_tenant_id AND status IN ('resolved', 'processed')) * 100 / NULLIF((SELECT COUNT(*) FROM dlq_events WHERE tenant_id = p_tenant_id), 0), 2)
      END
    ),
    'rollbacks', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id),
      'last_30d', (SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days')
    ),
    'alerts', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id),
      'open', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false),
      'critical_open', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false AND severity = 'critical'),
      'resolved', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = true),
      'decision_coverage_percent', CASE 
        WHEN (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = true) = 0 THEN 100
        ELSE ROUND(
          (SELECT COUNT(DISTINCT sa.id)::numeric FROM system_alerts sa 
           WHERE sa.tenant_id = p_tenant_id 
             AND sa.resolved = true
             AND EXISTS (
               SELECT 1 FROM decision_events de 
               WHERE de.tenant_id = p_tenant_id 
                 AND de.agent_id = sa.agent_id
             )) * 100 
          / NULLIF((SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = true), 0), 2)
      END
    ),
    'critical_alerts', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND severity = 'critical' AND resolved = false),
    'users', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM user_profiles WHERE tenant_id = p_tenant_id),
      'admins', (SELECT COUNT(*) FROM user_profiles WHERE tenant_id = p_tenant_id AND role IN ('admin', 'owner'))
    ),
    'policies', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id),
      'active', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true)
    ),
    'evidence_chain', jsonb_build_object(
      'total_logs', (SELECT COUNT(*) FROM agent_evidence_logs WHERE tenant_id = p_tenant_id),
      'last_24h', (SELECT COUNT(*) FROM agent_evidence_logs WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours')
    ),
    'tenant_isolation', (SELECT row_to_json(v.*) FROM v_tenant_isolation_metrics v WHERE v.tenant_id = p_tenant_id),
    'rbac', (SELECT row_to_json(v.*) FROM v_rbac_metrics v WHERE v.tenant_id = p_tenant_id),
    'enforcement', (SELECT row_to_json(v.*) FROM v_enforcement_compliance v WHERE v.tenant_id = p_tenant_id),
    'human_oversight', jsonb_build_object(
      'execution_approval_rate', CASE 
        WHEN (SELECT COUNT(*) FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours') = 0 THEN 100
        ELSE ROUND((SELECT COUNT(*)::numeric FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours' AND approval_status IN ('approved', 'auto_approved')) * 100 / NULLIF((SELECT COUNT(*) FROM command_executions WHERE tenant_id = p_tenant_id AND executed_at > NOW() - INTERVAL '24 hours'), 0), 2)
      END,
      'ai_review_rate', CASE 
        WHEN (SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id) = 0 THEN NULL
        ELSE ROUND((SELECT COUNT(*)::numeric FROM ai_action_proposals WHERE tenant_id = p_tenant_id AND human_reviewed = true) * 100 / NULLIF((SELECT COUNT(*) FROM ai_action_proposals WHERE tenant_id = p_tenant_id), 0), 2)
      END,
      'decision_review_rate', CASE 
        WHEN (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id) = 0 THEN NULL
        ELSE ROUND((SELECT COUNT(*)::numeric FROM decision_events WHERE tenant_id = p_tenant_id AND human_reviewed = true) * 100 / NULLIF((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id), 0), 2)
      END
    ),
    'collected_at', NOW(),
    'version', '2.1.0'
  ) INTO result;
  
  RETURN result;
END;
$$;