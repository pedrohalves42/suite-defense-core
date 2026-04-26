-- Create system_audits table to store Ana persona audit results
CREATE TABLE public.system_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Overall score (0-100)
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- 9 dimension scores (0-10 each)
  score_system_identity INTEGER NOT NULL CHECK (score_system_identity >= 0 AND score_system_identity <= 10),
  score_control_vs_monitor INTEGER NOT NULL CHECK (score_control_vs_monitor >= 0 AND score_control_vs_monitor <= 10),
  score_evidence_proof INTEGER NOT NULL CHECK (score_evidence_proof >= 0 AND score_evidence_proof <= 10),
  score_maturity INTEGER NOT NULL CHECK (score_maturity >= 0 AND score_maturity <= 10),
  score_failure_handling INTEGER NOT NULL CHECK (score_failure_handling >= 0 AND score_failure_handling <= 10),
  score_limitations INTEGER NOT NULL CHECK (score_limitations >= 0 AND score_limitations <= 10),
  score_operational_trust INTEGER NOT NULL CHECK (score_operational_trust >= 0 AND score_operational_trust <= 10),
  score_market_value INTEGER NOT NULL CHECK (score_market_value >= 0 AND score_market_value <= 10),
  score_simplicity INTEGER NOT NULL CHECK (score_simplicity >= 0 AND score_simplicity <= 10),
  
  -- Detailed analysis per dimension (markdown)
  analysis_system_identity TEXT,
  analysis_control_vs_monitor TEXT,
  analysis_evidence_proof TEXT,
  analysis_maturity TEXT,
  analysis_failure_handling TEXT,
  analysis_limitations TEXT,
  analysis_operational_trust TEXT,
  analysis_market_value TEXT,
  analysis_simplicity TEXT,
  
  -- Summary and recommendation
  executive_summary TEXT,
  final_sentence TEXT,
  recommendation TEXT CHECK (recommendation IN ('NOT_READY', 'READY_MVP', 'READY_FOR_SCALE', 'ENTERPRISE_READY')),
  
  -- Raw metrics collected during audit
  metrics_snapshot JSONB DEFAULT '{}',
  
  -- AI metadata
  ai_model TEXT,
  prompt_hash TEXT,
  tokens_used INTEGER
);

-- Create index for tenant queries
CREATE INDEX idx_system_audits_tenant_created ON public.system_audits(tenant_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.system_audits ENABLE ROW LEVEL SECURITY;

-- RLS policies: admins can view/create for their tenant
CREATE POLICY "Admins can view system audits"
  ON public.system_audits
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = system_audits.tenant_id
      AND ur.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can create system audits"
  ON public.system_audits
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = system_audits.tenant_id
      AND ur.role IN ('admin', 'super_admin')
    )
  );

-- Create RPC to get audit metrics for the AI function
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    'audit_logs_with_hash', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND payload_hash IS NOT NULL AND created_at > now() - interval '30 days'),
    
    -- AI decision metrics
    'decision_events_30d', (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    'ai_actions_30d', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND created_at > now() - interval '30 days'),
    'ai_actions_executed', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND status = 'executed' AND created_at > now() - interval '30 days'),
    'ai_actions_pending', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND status = 'pending' AND created_at > now() - interval '30 days'),
    
    -- Security policies
    'active_policies', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true),
    'policy_enforcements_30d', (SELECT COUNT(*) FROM policy_enforcement_logs WHERE tenant_id = p_tenant_id AND enforced_at > now() - interval '30 days'),
    
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_audit_raw_metrics(UUID) TO authenticated;