-- Update get_audit_raw_metrics to include human_reviewed counts
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result jsonb;
  v_agents jsonb;
  v_alerts jsonb;
  v_policies jsonb;
  v_dlq jsonb;
  v_ai_actions jsonb;
  v_ai_insights jsonb;
  v_evidence jsonb;
  v_execution_chain jsonb;
  v_decision_events jsonb;
  v_circuit_breaker jsonb;
BEGIN
  -- Agents metrics
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'online', COUNT(*) FILTER (WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'),
    'offline', COUNT(*) FILTER (WHERE last_heartbeat IS NULL OR last_heartbeat <= NOW() - INTERVAL '5 minutes'),
    'in_safe_mode', COUNT(*) FILTER (WHERE safe_mode_entered_at IS NOT NULL),
    'isolated', COUNT(*) FILTER (WHERE is_isolated = true),
    'throttled', COUNT(*) FILTER (WHERE is_throttled = true)
  ) INTO v_agents
  FROM public.agents WHERE tenant_id = p_tenant_id;

  -- Alerts metrics with human review tracking
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'critical_unresolved', COUNT(*) FILTER (WHERE severity = 'critical' AND resolved = false),
    'high_unresolved', COUNT(*) FILTER (WHERE severity = 'high' AND resolved = false),
    'resolved_total', COUNT(*) FILTER (WHERE resolved = true),
    'resolved_with_human', COUNT(*) FILTER (WHERE resolved = true AND resolved_by IS NOT NULL),
    'auto_resolved', COUNT(*) FILTER (WHERE resolved = true AND resolved_by IS NULL),
    'human_reviewed', COUNT(*) FILTER (WHERE human_reviewed = true),
    'human_reviewed_rate', ROUND((COUNT(*) FILTER (WHERE human_reviewed = true)::numeric / NULLIF(COUNT(*), 0) * 100), 2)
  ) INTO v_alerts
  FROM public.system_alerts WHERE tenant_id = p_tenant_id;

  -- Policies metrics
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM public.security_policies WHERE tenant_id = p_tenant_id),
    'enabled', (SELECT COUNT(*) FROM public.security_policies WHERE tenant_id = p_tenant_id AND is_active = true),
    'with_assignments', (
      SELECT COUNT(DISTINCT sp.id)
      FROM public.security_policies sp
      JOIN public.agent_group_policies agp ON sp.id = agp.policy_id
      WHERE sp.tenant_id = p_tenant_id
    ),
    'assignment_rate', ROUND(
      (SELECT COUNT(DISTINCT sp.id)::numeric
       FROM public.security_policies sp
       JOIN public.agent_group_policies agp ON sp.id = agp.policy_id
       WHERE sp.tenant_id = p_tenant_id) / 
      NULLIF((SELECT COUNT(*) FROM public.security_policies WHERE tenant_id = p_tenant_id), 0) * 100, 2
    )
  ) INTO v_policies;

  -- DLQ metrics with governance fields
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'resolved', COUNT(*) FILTER (WHERE status = 'resolved'),
    'critical_risk', COUNT(*) FILTER (WHERE risk_category = 'critical'),
    'high_risk', COUNT(*) FILTER (WHERE risk_category = 'high'),
    'sanitized', COUNT(*) FILTER (WHERE payload_hash IS NOT NULL),
    'unsanitized', COUNT(*) FILTER (WHERE payload_hash IS NULL AND original_payload IS NOT NULL),
    'oldest_pending_hours', EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status = 'pending'))) / 3600
  ) INTO v_dlq
  FROM public.failed_jobs_dlq WHERE tenant_id = p_tenant_id;

  -- AI Actions metrics with human review tracking
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'approved', COUNT(*) FILTER (WHERE approved = true),
    'pending_approval', COUNT(*) FILTER (WHERE approved = false AND status = 'pending'),
    'human_reviewed', COUNT(*) FILTER (WHERE human_reviewed = true),
    'human_reviewed_rate', ROUND((COUNT(*) FILTER (WHERE human_reviewed = true)::numeric / NULLIF(COUNT(*), 0) * 100), 2),
    'executed', COUNT(*) FILTER (WHERE status = 'executed'),
    'ai_validated', COUNT(*) FILTER (WHERE ai_validation_status IS NOT NULL),
    'ai_validation_pass', COUNT(*) FILTER (WHERE ai_validation_status = 'pass'),
    'ai_validation_escalate', COUNT(*) FILTER (WHERE ai_validation_status = 'escalate'),
    'ai_validation_fail', COUNT(*) FILTER (WHERE ai_validation_status = 'fail'),
    'requires_approval', COUNT(*) FILTER (WHERE requires_approval = true),
    'avg_validation_score', ROUND(AVG(ai_validation_score)::numeric, 2)
  ) INTO v_ai_actions
  FROM public.ai_actions WHERE tenant_id = p_tenant_id;

  -- AI Insights metrics with resolution integrity
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'acknowledged', COUNT(*) FILTER (WHERE acknowledged = true),
    'unacknowledged', COUNT(*) FILTER (WHERE acknowledged = false),
    'resolution_rate', ROUND((COUNT(*) FILTER (WHERE acknowledged = true)::numeric / NULLIF(COUNT(*), 0) * 100), 2),
    'resolved_with_decision', COUNT(*) FILTER (WHERE resolved_by_decision_event IS NOT NULL),
    'resolved_by_human', COUNT(*) FILTER (WHERE resolution_method = 'human_review'),
    'resolved_by_automation', COUNT(*) FILTER (WHERE resolution_method = 'automated_action'),
    'resolved_manual_dismiss', COUNT(*) FILTER (WHERE resolution_method = 'manual_dismiss'),
    'reviewed_no_action', COUNT(*) FILTER (WHERE resolution_method = 'manual_review_no_action' OR status = 'reviewed_no_action'),
    'governance_rate', ROUND((COUNT(*) FILTER (WHERE resolved_by_decision_event IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE acknowledged = true), 0) * 100), 2),
    'by_severity', jsonb_build_object(
      'critical', COUNT(*) FILTER (WHERE severity = 'critical'),
      'high', COUNT(*) FILTER (WHERE severity = 'high'),
      'medium', COUNT(*) FILTER (WHERE severity = 'medium'),
      'low', COUNT(*) FILTER (WHERE severity = 'low')
    )
  ) INTO v_ai_insights
  FROM public.ai_insights WHERE tenant_id = p_tenant_id;

  -- Evidence logs
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'last_24h', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),
    'by_severity', jsonb_build_object(
      'critical', COUNT(*) FILTER (WHERE severity = 'critical'),
      'high', COUNT(*) FILTER (WHERE severity = 'high'),
      'medium', COUNT(*) FILTER (WHERE severity = 'medium'),
      'low', COUNT(*) FILTER (WHERE severity = 'low')
    )
  ) INTO v_evidence
  FROM public.agent_evidence_logs WHERE tenant_id = p_tenant_id;

  -- Execution chain health
  SELECT jsonb_build_object(
    'total_agents_with_chain', COUNT(*),
    'healthy_chains', COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '24 hours'),
    'stale_chains', COUNT(*) FILTER (WHERE updated_at <= NOW() - INTERVAL '24 hours'),
    'chain_health_rate', ROUND((COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '24 hours')::numeric / NULLIF(COUNT(*), 0) * 100), 2)
  ) INTO v_execution_chain
  FROM public.agent_execution_chain aec
  JOIN public.agents a ON aec.agent_id = a.id
  WHERE a.tenant_id = p_tenant_id;

  -- Decision events with human/ai breakdown
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'last_24h', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),
    'human_decisions', COUNT(*) FILTER (WHERE decision_source = 'human'),
    'ai_decisions', COUNT(*) FILTER (WHERE decision_source = 'ai'),
    'human_decision_rate', ROUND((COUNT(*) FILTER (WHERE decision_source = 'human')::numeric / NULLIF(COUNT(*), 0) * 100), 2),
    'by_source', jsonb_build_object(
      'human', COUNT(*) FILTER (WHERE decision_source = 'human'),
      'ai', COUNT(*) FILTER (WHERE decision_source = 'ai'),
      'system', COUNT(*) FILTER (WHERE decision_source IN ('system', 'resilience_engine')),
      'policy', COUNT(*) FILTER (WHERE decision_source = 'policy')
    ),
    'by_type', jsonb_build_object(
      'approval', COUNT(*) FILTER (WHERE decision_type = 'approval'),
      'rejection', COUNT(*) FILTER (WHERE decision_type = 'rejection'),
      'escalation', COUNT(*) FILTER (WHERE decision_type = 'escalation'),
      'system', COUNT(*) FILTER (WHERE decision_type = 'system')
    )
  ) INTO v_decision_events
  FROM public.decision_events WHERE tenant_id = p_tenant_id;

  -- Circuit breaker health
  SELECT jsonb_build_object(
    'total_events', COUNT(*),
    'events_24h', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),
    'currently_open', (
      SELECT COUNT(DISTINCT service) 
      FROM public.circuit_breaker_events cb1
      WHERE cb1.tenant_id = p_tenant_id
      AND cb1.state = 'open'
      AND cb1.created_at = (
        SELECT MAX(created_at) 
        FROM public.circuit_breaker_events cb2 
        WHERE cb2.service = cb1.service AND cb2.tenant_id = p_tenant_id
      )
    ),
    'services_healthy', (
      SELECT COUNT(DISTINCT service) 
      FROM public.circuit_breaker_events cb1
      WHERE cb1.tenant_id = p_tenant_id
      AND cb1.state = 'closed'
      AND cb1.created_at = (
        SELECT MAX(created_at) 
        FROM public.circuit_breaker_events cb2 
        WHERE cb2.service = cb1.service AND cb2.tenant_id = p_tenant_id
      )
    )
  ) INTO v_circuit_breaker
  FROM public.circuit_breaker_events WHERE tenant_id = p_tenant_id;

  -- Build final result
  result := jsonb_build_object(
    'agents', COALESCE(v_agents, '{}'::jsonb),
    'alerts', COALESCE(v_alerts, '{}'::jsonb),
    'policies', COALESCE(v_policies, '{}'::jsonb),
    'dlq', COALESCE(v_dlq, '{}'::jsonb),
    'ai_actions', COALESCE(v_ai_actions, '{}'::jsonb),
    'ai_insights', COALESCE(v_ai_insights, '{}'::jsonb),
    'evidence', COALESCE(v_evidence, '{}'::jsonb),
    'execution_chain', COALESCE(v_execution_chain, '{}'::jsonb),
    'decision_events', COALESCE(v_decision_events, '{}'::jsonb),
    'circuit_breaker', COALESCE(v_circuit_breaker, '{}'::jsonb),
    'collected_at', NOW()
  );

  RETURN result;
END;
$$;