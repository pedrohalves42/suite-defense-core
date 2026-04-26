-- Drop existing function and recreate with correct table reference
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  agent_metrics JSONB;
  security_metrics JSONB;
  alert_metrics JSONB;
  compliance_metrics JSONB;
  activity_summary JSONB;
BEGIN
  -- Validate user_id is provided
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required' USING ERRCODE = '28000';
  END IF;

  -- Validate user has access to tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.user_tenants 
    WHERE user_id = p_user_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Access denied to tenant' USING ERRCODE = '42501';
  END IF;

  -- Agent metrics
  SELECT jsonb_build_object(
    'total_agents', COUNT(*),
    'online_agents', COUNT(*) FILTER (WHERE status = 'online'),
    'offline_agents', COUNT(*) FILTER (WHERE status = 'offline'),
    'isolated_agents', COUNT(*) FILTER (WHERE is_isolated = true),
    'safe_mode_agents', COUNT(*) FILTER (WHERE agent_state = 'safe_mode'),
    'agents_needing_update', COUNT(*) FILTER (WHERE agent_version IS DISTINCT FROM (
      SELECT version FROM public.agent_versions WHERE is_latest = true LIMIT 1
    )),
    'avg_uptime_hours', COALESCE(
      (SELECT AVG(uptime_seconds) / 3600 FROM public.agent_system_metrics 
       WHERE tenant_id = p_tenant_id AND collected_at > NOW() - INTERVAL '24 hours'), 0
    )
  ) INTO agent_metrics
  FROM public.agents WHERE tenant_id = p_tenant_id;

  -- Security metrics
  SELECT jsonb_build_object(
    'policies_count', (SELECT COUNT(*) FROM public.security_policies WHERE tenant_id = p_tenant_id),
    'active_policies', (SELECT COUNT(*) FROM public.security_policies WHERE tenant_id = p_tenant_id AND is_active = true),
    'blocked_domains', (SELECT COUNT(*) FROM public.blocked_domains WHERE tenant_id = p_tenant_id),
    'blocked_processes', (SELECT COUNT(*) FROM public.blocked_processes WHERE tenant_id = p_tenant_id),
    'enrollment_keys_active', (SELECT COUNT(*) FROM public.enrollment_keys WHERE tenant_id = p_tenant_id AND is_active = true),
    'recent_security_events', (
      SELECT COUNT(*) FROM public.agent_evidence_logs 
      WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours'
    )
  ) INTO security_metrics;

  -- Alert metrics (using correct table: public.system_alerts)
  SELECT jsonb_build_object(
    'total_alerts', COUNT(*),
    'critical_alerts', COUNT(*) FILTER (WHERE severity = 'critical'),
    'high_alerts', COUNT(*) FILTER (WHERE severity = 'high'),
    'medium_alerts', COUNT(*) FILTER (WHERE severity = 'medium'),
    'low_alerts', COUNT(*) FILTER (WHERE severity = 'low'),
    'unresolved_alerts', COUNT(*) FILTER (WHERE resolved_at IS NULL),
    'alerts_last_24h', COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')
  ) INTO alert_metrics
  FROM public.system_alerts WHERE tenant_id = p_tenant_id;

  -- Compliance metrics
  SELECT jsonb_build_object(
    'total_audits', (SELECT COUNT(*) FROM public.system_audits WHERE tenant_id = p_tenant_id),
    'passed_audits', (SELECT COUNT(*) FROM public.system_audits WHERE tenant_id = p_tenant_id AND overall_status = 'passed'),
    'failed_audits', (SELECT COUNT(*) FROM public.system_audits WHERE tenant_id = p_tenant_id AND overall_status = 'failed'),
    'last_audit_date', (SELECT MAX(created_at) FROM public.system_audits WHERE tenant_id = p_tenant_id),
    'avg_compliance_score', (
      SELECT AVG(overall_score) FROM public.system_audits 
      WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days'
    ),
    'red_team_assessments', (SELECT COUNT(*) FROM public.red_team_assessments WHERE tenant_id = p_tenant_id),
    'latest_red_team_score', (
      SELECT overall_risk_score FROM public.red_team_assessments 
      WHERE tenant_id = p_tenant_id ORDER BY created_at DESC LIMIT 1
    )
  ) INTO compliance_metrics;

  -- Activity summary (using correct table: public.system_alerts)
  SELECT jsonb_build_object(
    'commands_executed_24h', (
      SELECT COUNT(*) FROM public.command_queue 
      WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours'
    ),
    'failed_commands_24h', (
      SELECT COUNT(*) FROM public.command_queue 
      WHERE tenant_id = p_tenant_id AND status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'
    ),
    'web_activity_records', (
      SELECT COUNT(*) FROM public.agent_web_activity 
      WHERE tenant_id = p_tenant_id AND visited_at > NOW() - INTERVAL '24 hours'
    ),
    'blocked_sites_accessed', (
      SELECT COUNT(*) FROM public.agent_web_activity 
      WHERE tenant_id = p_tenant_id AND is_blocked = true AND visited_at > NOW() - INTERVAL '24 hours'
    ),
    'new_agents_24h', (
      SELECT COUNT(*) FROM public.agents 
      WHERE tenant_id = p_tenant_id AND enrolled_at > NOW() - INTERVAL '24 hours'
    ),
    'alerts_created_24h', (
      SELECT COUNT(*) FROM public.system_alerts 
      WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '24 hours'
    )
  ) INTO activity_summary;

  -- Build final result
  result := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'collected_at', NOW(),
    'agent_metrics', agent_metrics,
    'security_metrics', security_metrics,
    'alert_metrics', alert_metrics,
    'compliance_metrics', compliance_metrics,
    'activity_summary', activity_summary
  );

  RETURN result;
END;
$$;