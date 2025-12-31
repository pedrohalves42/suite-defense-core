-- Fix get_audit_raw_metrics RPC: replace enforced_at with created_at
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
    -- Agent metrics
    'total_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id),
    'online_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND status = 'online'),
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
    
    -- Security policies (FIXED: enforced_at -> created_at)
    'active_policies', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true),
    'policy_enforcements_30d', (SELECT COUNT(*) FROM policy_enforcement_logs WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    
    -- Alerts
    'critical_alerts_30d', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND severity = 'critical' AND created_at > now() - interval '30 days'),
    'resolved_alerts_30d', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND status = 'resolved' AND created_at > now() - interval '30 days'),
    
    -- Decision rules
    'active_rules', (SELECT COUNT(*) FROM decision_rules WHERE tenant_id = p_tenant_id AND is_enabled = true),
    'auto_execute_rules', (SELECT COUNT(*) FROM decision_rules WHERE tenant_id = p_tenant_id AND is_enabled = true AND (definition->>'auto_execute')::boolean = true),
    
    -- Evidence integrity
    'evidence_logs_30d', (SELECT COUNT(*) FROM agent_evidence_logs WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    
    -- Vulnerabilities
    'critical_vulns', (SELECT COUNT(*) FROM vuln_findings WHERE tenant_id = p_tenant_id AND severity = 'critical'),
    'high_vulns', (SELECT COUNT(*) FROM vuln_findings WHERE tenant_id = p_tenant_id AND severity = 'high')
  ) INTO result;
  
  RETURN result;
END;
$$;