-- Drop all versions of get_audit_raw_metrics to resolve ambiguity
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid);
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics();

-- Recreate with updated logic including tenant_isolation, rbac, enforcement metrics
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_has_access boolean;
  
  -- Agent metrics
  v_agents_total integer;
  v_agents_online integer;
  v_agents_offline integer;
  v_agents_warning integer;
  v_agents_critical integer;
  v_agents_safe_mode integer;
  
  -- Alert metrics
  v_alerts_total integer;
  v_alerts_critical integer;
  v_alerts_high integer;
  v_alerts_medium integer;
  v_alerts_low integer;
  v_alerts_unresolved integer;
  v_alerts_critical_resolved integer;
  
  -- Policy metrics
  v_policies_total integer;
  v_policies_enabled integer;
  v_policies_with_assignments integer;
  v_policy_assignments_total integer;
  
  -- AI Actions metrics
  v_ai_actions_total integer;
  v_ai_actions_approved integer;
  v_ai_actions_rejected integer;
  v_ai_actions_pending integer;
  v_ai_actions_human_reviewed integer;
  v_ai_actions_shadow_validated integer;
  
  -- AI Insights metrics
  v_ai_insights_total integer;
  v_ai_insights_resolved integer;
  v_ai_insights_acknowledged integer;
  
  -- Governance metrics
  v_dlq_total integer;
  v_dlq_pending integer;
  v_approval_rate numeric;
  
  -- Execution chain metrics
  v_chain_total integer;
  v_chain_healthy integer;
  
  -- Safe mode events
  v_safe_mode_total integer;
  v_safe_mode_active integer;
  
  -- Evidence logs
  v_evidence_total integer;
  v_evidence_recent integer;
  
  -- Rollback events
  v_rollbacks_total integer;
  v_rollbacks_recent integer;
  
  -- Recent activity
  v_alerts_24h integer;
  v_ai_actions_24h integer;
  v_agents_updated_24h integer;
  
  -- Users
  v_users_count integer;
  
  -- Decision Events metrics
  v_decision_events_total integer;
  v_decision_events_alert_resolution integer;
  v_decision_events_rollback integer;
  v_decision_events_by_human integer;
  v_decision_events_by_system integer;
  
  -- Alert-Decision coverage
  v_alerts_with_decision_event integer;
  v_alert_decision_coverage numeric;
  
  -- Tenant Isolation metrics
  v_tenant_isolation jsonb;
  
  -- RBAC metrics
  v_rbac jsonb;
  
  -- Enforcement metrics
  v_enforcement jsonb;
  
  -- Human Oversight metrics
  v_human_oversight jsonb;
  
BEGIN
  IF p_user_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'user_id and tenant_id are required';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles 
    WHERE user_id = p_user_id AND tenant_id = p_tenant_id
  ) INTO v_has_access;
  
  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Access denied to tenant';
  END IF;

  -- AGENT METRICS
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'),
    COUNT(*) FILTER (WHERE last_heartbeat IS NULL OR last_heartbeat < NOW() - INTERVAL '10 minutes'),
    COUNT(*) FILTER (WHERE last_heartbeat BETWEEN NOW() - INTERVAL '10 minutes' AND NOW() - INTERVAL '5 minutes'),
    COUNT(*) FILTER (WHERE is_isolated = true OR is_throttled = true),
    COUNT(*) FILTER (WHERE safe_mode_entered_at IS NOT NULL)
  INTO v_agents_total, v_agents_online, v_agents_offline, v_agents_warning, v_agents_critical, v_agents_safe_mode
  FROM public.agents WHERE tenant_id = p_tenant_id;

  -- ALERT METRICS
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE severity = 'critical'),
    COUNT(*) FILTER (WHERE severity = 'high'),
    COUNT(*) FILTER (WHERE severity = 'medium'),
    COUNT(*) FILTER (WHERE severity = 'low'),
    COUNT(*) FILTER (WHERE resolved = false),
    COUNT(*) FILTER (WHERE severity = 'critical' AND resolved = true)
  INTO v_alerts_total, v_alerts_critical, v_alerts_high, v_alerts_medium, v_alerts_low, v_alerts_unresolved, v_alerts_critical_resolved
  FROM public.system_alerts WHERE tenant_id = p_tenant_id;

  -- POLICY METRICS
  SELECT COUNT(*), COUNT(*) FILTER (WHERE enabled = true)
  INTO v_policies_total, v_policies_enabled
  FROM public.security_policies WHERE tenant_id = p_tenant_id;
  
  SELECT COUNT(DISTINCT sp.id) INTO v_policies_with_assignments
  FROM public.security_policies sp
  JOIN public.agent_group_policies agp ON sp.id = agp.policy_id
  WHERE sp.tenant_id = p_tenant_id;
  
  SELECT COUNT(*) INTO v_policy_assignments_total
  FROM public.policy_assignments WHERE tenant_id = p_tenant_id;

  -- AI ACTIONS METRICS - FIXED: include review_decision = 'approved'
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE approved_at IS NOT NULL OR review_decision = 'approved'),
    COUNT(*) FILTER (WHERE review_decision = 'rejected'),
    COUNT(*) FILTER (WHERE status = 'pending' AND review_decision IS NULL),
    COUNT(*) FILTER (WHERE human_reviewed = true),
    COUNT(*) FILTER (WHERE shadow_validation IS NOT NULL)
  INTO v_ai_actions_total, v_ai_actions_approved, v_ai_actions_rejected, v_ai_actions_pending, v_ai_actions_human_reviewed, v_ai_actions_shadow_validated
  FROM public.ai_actions WHERE tenant_id = p_tenant_id;

  -- AI INSIGHTS METRICS
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE resolved_at IS NOT NULL),
    COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL)
  INTO v_ai_insights_total, v_ai_insights_resolved, v_ai_insights_acknowledged
  FROM public.ai_insights WHERE tenant_id = p_tenant_id;

  -- GOVERNANCE METRICS
  SELECT COUNT(*), COUNT(*) FILTER (WHERE resolved_at IS NULL)
  INTO v_dlq_total, v_dlq_pending
  FROM public.failed_jobs_dlq WHERE tenant_id = p_tenant_id;
  
  IF v_ai_actions_total > 0 THEN
    v_approval_rate := ROUND((v_ai_actions_approved::numeric / v_ai_actions_total::numeric) * 100, 2);
  ELSE
    v_approval_rate := 100;
  END IF;

  -- EXECUTION CHAIN METRICS
  SELECT COUNT(*), COUNT(*) FILTER (WHERE last_execution_index > 0)
  INTO v_chain_total, v_chain_healthy
  FROM public.agent_execution_chain aec
  JOIN public.agents a ON aec.agent_id = a.id
  WHERE a.tenant_id = p_tenant_id;

  -- SAFE MODE EVENTS
  SELECT COUNT(*), COUNT(*) FILTER (WHERE resolved_at IS NULL)
  INTO v_safe_mode_total, v_safe_mode_active
  FROM public.agent_safe_mode_events WHERE tenant_id = p_tenant_id;

  -- EVIDENCE LOGS
  SELECT COUNT(*), COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')
  INTO v_evidence_total, v_evidence_recent
  FROM public.agent_evidence_logs WHERE tenant_id = p_tenant_id;

  -- ROLLBACK EVENTS
  SELECT COUNT(*), COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')
  INTO v_rollbacks_total, v_rollbacks_recent
  FROM public.agent_rollback_events WHERE tenant_id = p_tenant_id;

  -- RECENT ACTIVITY
  SELECT COUNT(*) INTO v_alerts_24h FROM public.system_alerts
  WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours';
  
  SELECT COUNT(*) INTO v_ai_actions_24h FROM public.ai_actions
  WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours';
  
  SELECT COUNT(*) INTO v_agents_updated_24h FROM public.agents
  WHERE tenant_id = p_tenant_id AND last_heartbeat > NOW() - INTERVAL '24 hours';

  -- USER COUNT
  SELECT COUNT(*) INTO v_users_count FROM public.user_roles WHERE tenant_id = p_tenant_id;

  -- DECISION EVENTS METRICS
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE decision_type = 'alert_resolution'),
    COUNT(*) FILTER (WHERE decision_type = 'rollback'),
    COUNT(*) FILTER (WHERE decision_source = 'human'),
    COUNT(*) FILTER (WHERE decision_source IN ('system', 'ai'))
  INTO v_decision_events_total, v_decision_events_alert_resolution, v_decision_events_rollback, v_decision_events_by_human, v_decision_events_by_system
  FROM public.decision_events WHERE tenant_id = p_tenant_id;

  -- ALERT-DECISION COVERAGE
  SELECT COUNT(DISTINCT sa.id) INTO v_alerts_with_decision_event
  FROM public.system_alerts sa
  WHERE sa.tenant_id = p_tenant_id AND sa.severity = 'critical' AND sa.resolved = true
    AND EXISTS (
      SELECT 1 FROM public.decision_events de 
      WHERE de.tenant_id = p_tenant_id AND de.decision_type = 'alert_resolution'
        AND (de.evidence->>'alert_id')::uuid = sa.id
    );
  
  IF v_alerts_critical_resolved > 0 THEN
    v_alert_decision_coverage := ROUND((v_alerts_with_decision_event::numeric / v_alerts_critical_resolved::numeric) * 100, 2);
  ELSE
    v_alert_decision_coverage := 100;
  END IF;

  -- TENANT ISOLATION METRICS
  SELECT jsonb_build_object(
    'rls_coverage_pct', COALESCE(rls_coverage_pct, 0),
    'isolation_coverage_pct', COALESCE(isolation_coverage_pct, 0),
    'tables_with_rls', COALESCE(tables_with_rls, 0),
    'total_tables', COALESCE(total_tables, 0),
    'isolation_status', COALESCE(isolation_status, 'unknown'),
    'rls_status', COALESCE(rls_status, 'unknown'),
    'compliant', COALESCE(rls_coverage_pct >= 95 AND isolation_coverage_pct >= 70, false)
  ) INTO v_tenant_isolation FROM public.v_tenant_isolation_metrics;
  
  IF v_tenant_isolation IS NULL THEN
    v_tenant_isolation := '{"rls_coverage_pct":0,"isolation_coverage_pct":0,"compliant":false}'::jsonb;
  END IF;

  -- RBAC METRICS
  SELECT jsonb_build_object(
    'total_role_assignments', COALESCE(total_role_assignments, 0),
    'users_with_roles', COALESCE(users_with_roles, 0),
    'admin_count', COALESCE(admin_count, 0),
    'super_admin_count', COALESCE(super_admin_count, 0),
    'operator_count', COALESCE(operator_count, 0),
    'viewer_count', COALESCE(viewer_count, 0),
    'rbac_status', COALESCE(rbac_status, 'unknown'),
    'security_functions_present', COALESCE(has_tenant_id_function AND has_role_function AND has_super_admin_function AND has_tenant_access_function, false),
    'compliant', COALESCE(rbac_status = 'operational', false)
  ) INTO v_rbac FROM public.v_rbac_metrics;
  
  IF v_rbac IS NULL THEN
    v_rbac := '{"total_role_assignments":0,"compliant":false}'::jsonb;
  END IF;

  -- ENFORCEMENT COMPLIANCE METRICS
  SELECT jsonb_build_object(
    'active_since', enforcement_active_since,
    'ai_actions_compliance_pct', COALESCE(ai_actions_compliance_pct, 100),
    'critical_alerts_compliance_pct', COALESCE(critical_alerts_compliance_pct, 100),
    'dlq_compliance_pct', COALESCE(dlq_compliance_pct, 100),
    'enforcement_status', COALESCE(enforcement_status, 'unknown'),
    'fully_compliant', COALESCE(enforcement_status = 'fully_compliant', false),
    'legacy_data', jsonb_build_object('critical_alerts', COALESCE(legacy_critical_alerts, 0), 'dlq_resolved', COALESCE(legacy_dlq_resolved, 0))
  ) INTO v_enforcement FROM public.v_enforcement_compliance;
  
  IF v_enforcement IS NULL THEN
    v_enforcement := '{"fully_compliant":false}'::jsonb;
  END IF;

  -- HUMAN OVERSIGHT METRICS
  v_human_oversight := jsonb_build_object(
    'ai_actions_reviewed_pct', CASE WHEN v_ai_actions_total = 0 THEN 100 ELSE ROUND((v_ai_actions_human_reviewed::numeric / v_ai_actions_total::numeric) * 100, 2) END,
    'critical_alerts_human_resolved_pct', (
      SELECT CASE WHEN COUNT(*) = 0 THEN 100 ELSE ROUND(COUNT(*) FILTER (WHERE resolved_by IS NOT NULL)::numeric / COUNT(*)::numeric * 100, 2) END 
      FROM public.system_alerts WHERE tenant_id = p_tenant_id AND severity = 'critical' AND resolved = true
    ),
    'approval_requests_pending', (SELECT COUNT(*) FROM public.approval_requests WHERE tenant_id = p_tenant_id AND status = 'pending'),
    'human_intervention_rate', CASE WHEN v_decision_events_total = 0 THEN 0 ELSE ROUND((v_decision_events_by_human::numeric / v_decision_events_total::numeric) * 100, 2) END
  );

  -- BUILD RESULT
  v_result := jsonb_build_object(
    'agents', jsonb_build_object('total', v_agents_total, 'online', v_agents_online, 'offline', v_agents_offline, 'warning', v_agents_warning, 'critical', v_agents_critical, 'safe_mode', v_agents_safe_mode),
    'alerts', jsonb_build_object('total', v_alerts_total, 'critical', v_alerts_critical, 'high', v_alerts_high, 'medium', v_alerts_medium, 'low', v_alerts_low, 'unresolved', v_alerts_unresolved, 'critical_resolved', v_alerts_critical_resolved, 'with_decision_event', v_alerts_with_decision_event, 'decision_coverage_percent', v_alert_decision_coverage),
    'policies', jsonb_build_object('total', v_policies_total, 'enabled', v_policies_enabled, 'with_assignments', v_policies_with_assignments, 'policy_assignments_total', v_policy_assignments_total, 'assignment_rate', CASE WHEN v_policies_total > 0 THEN ROUND((v_policies_with_assignments::numeric / v_policies_total::numeric) * 100, 2) ELSE 0 END),
    'ai_actions', jsonb_build_object('total', v_ai_actions_total, 'approved', v_ai_actions_approved, 'rejected', v_ai_actions_rejected, 'pending', v_ai_actions_pending, 'human_reviewed', v_ai_actions_human_reviewed, 'shadow_validated', v_ai_actions_shadow_validated, 'shadow_validation_rate', CASE WHEN v_ai_actions_total > 0 THEN ROUND((v_ai_actions_shadow_validated::numeric / v_ai_actions_total::numeric) * 100, 2) ELSE 0 END, 'human_review_rate', CASE WHEN v_ai_actions_total > 0 THEN ROUND((v_ai_actions_human_reviewed::numeric / v_ai_actions_total::numeric) * 100, 2) ELSE 0 END, 'approval_rate', v_approval_rate),
    'ai_insights', jsonb_build_object('total', v_ai_insights_total, 'resolved', v_ai_insights_resolved, 'acknowledged', v_ai_insights_acknowledged, 'resolution_rate', CASE WHEN v_ai_insights_total > 0 THEN ROUND((v_ai_insights_resolved::numeric / v_ai_insights_total::numeric) * 100, 2) ELSE 0 END),
    'governance', jsonb_build_object('dlq_total', v_dlq_total, 'dlq_pending', v_dlq_pending, 'dlq_resolved_rate', CASE WHEN v_dlq_total > 0 THEN ROUND(((v_dlq_total - v_dlq_pending)::numeric / v_dlq_total::numeric) * 100, 2) ELSE 100 END, 'approval_rate', v_approval_rate, 'human_review_count', v_ai_actions_human_reviewed),
    'decision_events', jsonb_build_object('total', v_decision_events_total, 'alert_resolutions', v_decision_events_alert_resolution, 'rollbacks', v_decision_events_rollback, 'by_human', v_decision_events_by_human, 'by_system', v_decision_events_by_system, 'human_rate', CASE WHEN v_decision_events_total > 0 THEN ROUND((v_decision_events_by_human::numeric / v_decision_events_total::numeric) * 100, 2) ELSE 0 END),
    'execution_chain', jsonb_build_object('total', v_chain_total, 'healthy', v_chain_healthy, 'health_rate', CASE WHEN v_chain_total > 0 THEN ROUND((v_chain_healthy::numeric / v_chain_total::numeric) * 100, 2) ELSE 100 END),
    'safe_mode', jsonb_build_object('total_events', v_safe_mode_total, 'active', v_safe_mode_active),
    'evidence', jsonb_build_object('total', v_evidence_total, 'recent_24h', v_evidence_recent),
    'rollbacks', jsonb_build_object('total', v_rollbacks_total, 'recent_7d', v_rollbacks_recent),
    'recent_activity', jsonb_build_object('alerts_24h', v_alerts_24h, 'ai_actions_24h', v_ai_actions_24h, 'agents_updated_24h', v_agents_updated_24h),
    'users_count', v_users_count,
    'tenant_isolation', v_tenant_isolation,
    'rbac', v_rbac,
    'enforcement', v_enforcement,
    'human_oversight', v_human_oversight,
    'collected_at', NOW()
  );

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_audit_raw_metrics(uuid, uuid) IS 'Comprehensive audit metrics for ANA. Updated 2026-01-03 with tenant_isolation, rbac, enforcement, human_oversight sections and fixed approval_rate calculation.';