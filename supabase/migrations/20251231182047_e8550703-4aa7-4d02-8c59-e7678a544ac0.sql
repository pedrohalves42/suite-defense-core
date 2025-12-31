-- Fix get_audit_raw_metrics RPC: correct column references
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    -- Agent metrics (FIXED: status = 'active' instead of 'online')
    'total_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id),
    'online_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND status = 'active' AND last_heartbeat > now() - interval '5 minutes'),
    'agents_with_keys', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND result_public_key IS NOT NULL),
    
    -- Job metrics
    'total_jobs_30d', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    'completed_jobs_30d', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND status = 'completed' AND created_at > now() - interval '30 days'),
    'failed_jobs_30d', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND status = 'failed' AND created_at > now() - interval '30 days'),
    
    -- Audit trail metrics
    'audit_logs_30d', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    'audit_logs_with_hash', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND integrity_hash IS NOT NULL AND created_at > now() - interval '30 days'),
    
    -- AI decision metrics
    'decision_events_30d', (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    'ai_actions_30d', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    'ai_actions_executed', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND status = 'executed' AND created_at > now() - interval '30 days'),
    'ai_actions_pending', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND status = 'pending' AND created_at > now() - interval '30 days'),
    
    -- Security policies
    'active_policies', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true),
    'policy_enforcements_30d', (SELECT COUNT(*) FROM policy_enforcement_logs WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    
    -- Alerts (FIXED: resolved = true instead of status = 'resolved')
    'critical_alerts_30d', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND severity = 'critical' AND created_at > now() - interval '30 days'),
    'resolved_alerts_30d', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = true AND created_at > now() - interval '30 days'),
    
    -- Decision rules (FIXED: removed tenant_id filter - table doesn't have this column)
    'active_rules', (SELECT COUNT(*) FROM decision_rules WHERE is_enabled = true),
    'auto_execute_rules', (SELECT COUNT(*) FROM decision_rules WHERE is_enabled = true AND coalesce((definition->>'auto_execute')::boolean, false) = true),
    
    -- Evidence integrity
    'evidence_logs_30d', (SELECT COUNT(*) FROM agent_evidence_logs WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    
    -- Vulnerabilities
    'critical_vulns', (SELECT COUNT(*) FROM vuln_findings WHERE tenant_id = p_tenant_id AND severity = 'critical'),
    'high_vulns', (SELECT COUNT(*) FROM vuln_findings WHERE tenant_id = p_tenant_id AND severity = 'high')
  ) INTO result;
  
  RETURN result;
END;
$$;