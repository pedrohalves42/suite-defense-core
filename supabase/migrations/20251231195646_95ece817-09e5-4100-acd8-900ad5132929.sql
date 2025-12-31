
-- Atualizar get_audit_raw_metrics para excluir do calculo de success rate
-- os jobs com failure_class classificados como nao-erro (DLQ/esperados)
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    -- Agentes e Autenticacao
    'total_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id),
    'active_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND status = 'active'),
    'agents_with_keys', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND (result_public_key IS NOT NULL OR (hmac_secret IS NOT NULL AND hmac_secret != ''))),
    
    -- Politicas e Enforcements
    'active_policies', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true),
    'policy_enforcements_30d', (SELECT COUNT(*) FROM policy_enforcement_logs WHERE tenant_id = p_tenant_id AND created_at >= now() - interval '30 days'),
    
    -- Jobs e Success Rate 
    -- Excluir do calculo: EXPECTED_DROP, AGENT_OFFLINE, AGENT_STALLED, CASCADE_FAILURE (problemas externos)
    'total_jobs_30d', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at >= now() - interval '30 days'),
    'completed_jobs_30d', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND status = 'completed' AND created_at >= now() - interval '30 days'),
    'failed_jobs_30d', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND status = 'failed' AND failure_class NOT IN ('EXPECTED_DROP', 'AGENT_OFFLINE', 'AGENT_STALLED', 'CASCADE_FAILURE', 'POLICY') AND created_at >= now() - interval '30 days'),
    'job_success_rate', (
      SELECT COALESCE(ROUND(
        COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
        NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed') AND (failure_class IS NULL OR failure_class NOT IN ('EXPECTED_DROP', 'AGENT_OFFLINE', 'AGENT_STALLED', 'CASCADE_FAILURE', 'POLICY'))), 0) * 100, 2
      ), 100)
      FROM jobs
      WHERE tenant_id = p_tenant_id AND created_at >= now() - interval '30 days'
    ),
    
    -- Metricas de falha real (apenas BUG e AGENT_INCOMPATIBLE)
    'real_failures_30d', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND status = 'failed' AND failure_class IN ('BUG', 'AGENT_INCOMPATIBLE') AND created_at >= now() - interval '30 days'),
    
    -- AI e Automacao
    'ai_actions_executed', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND status = 'executed' AND created_at >= now() - interval '30 days'),
    'decision_events_30d', (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND created_at >= now() - interval '30 days'),
    'auto_execute_rules', (SELECT COUNT(*) FROM decision_rules WHERE auto_execute = true AND is_enabled = true),
    
    -- Auditoria e Integridade
    'audit_logs_30d', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND created_at >= now() - interval '30 days'),
    'audit_logs_with_hash', (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = p_tenant_id AND integrity_hash IS NOT NULL AND created_at >= now() - interval '30 days'),
    
    -- DLQ
    'dlq_jobs_30d', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND created_at >= now() - interval '30 days'),
    
    -- RLS e Isolamento (metricas globais)
    'rls_enabled_tables', (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true),
    'total_public_tables', (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public'),
    'rls_coverage_pct', (
      SELECT COALESCE(ROUND(
        COUNT(*) FILTER (WHERE rowsecurity = true)::numeric / 
        NULLIF(COUNT(*), 0) * 100, 2
      ), 0)
      FROM pg_tables WHERE schemaname = 'public'
    ),
    
    -- Blocked Access
    'blocked_access_30d', (SELECT COUNT(*) FROM blocked_access_attempts WHERE tenant_id = p_tenant_id AND created_at >= now() - interval '30 days'),
    
    -- Insights
    'ai_insights_30d', (SELECT COUNT(*) FROM ai_insights WHERE tenant_id = p_tenant_id AND created_at >= now() - interval '30 days')
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;
