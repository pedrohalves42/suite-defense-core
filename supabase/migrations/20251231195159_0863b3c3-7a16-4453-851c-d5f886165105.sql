
-- =============================================================================
-- FASE 1: Atualizar funcao get_audit_raw_metrics
-- =============================================================================

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
    
    -- Jobs e Success Rate (excluindo EXPECTED_DROP do calculo de falhas)
    'total_jobs_30d', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND created_at >= now() - interval '30 days'),
    'completed_jobs_30d', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND status = 'completed' AND created_at >= now() - interval '30 days'),
    'failed_jobs_30d', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND status = 'failed' AND failure_class IS DISTINCT FROM 'EXPECTED_DROP' AND created_at >= now() - interval '30 days'),
    'job_success_rate', (
      SELECT COALESCE(ROUND(
        COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
        NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed') AND failure_class IS DISTINCT FROM 'EXPECTED_DROP'), 0) * 100, 2
      ), 0)
      FROM jobs
      WHERE tenant_id = p_tenant_id AND created_at >= now() - interval '30 days'
    ),
    
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

-- =============================================================================
-- FASE 2: Sincronizar Policy Enforcements
-- =============================================================================

-- 2.1 Criar funcao de sincronizacao (policy_id opcional)
CREATE OR REPLACE FUNCTION sync_blocked_to_enforcement()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_policy_id uuid;
BEGIN
  -- Verificar se policy_id existe antes de usar
  SELECT id INTO v_valid_policy_id 
  FROM security_policies 
  WHERE id = NEW.policy_id;

  INSERT INTO policy_enforcement_logs (
    tenant_id, agent_id, policy_id,
    rule_type, action_taken, target, blocked, details, created_at
  ) VALUES (
    NEW.tenant_id, NEW.agent_id, v_valid_policy_id,
    'website_block', 'blocked', NEW.domain, true,
    jsonb_build_object('blocked_by', NEW.blocked_by, 'source', 'auto_sync'),
    NEW.attempted_at
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- 2.2 Criar trigger
DROP TRIGGER IF EXISTS trg_sync_blocked_enforcement ON blocked_access_attempts;
CREATE TRIGGER trg_sync_blocked_enforcement
AFTER INSERT ON blocked_access_attempts
FOR EACH ROW
EXECUTE FUNCTION sync_blocked_to_enforcement();

-- =============================================================================
-- FASE 3: Criar Politicas de Seguranca Adicionais (usando alias de tabela)
-- =============================================================================

INSERT INTO security_policies (tenant_id, name, description, is_active, priority)
SELECT t.id, 
  'Controle de Dispositivos USB',
  'Monitora e alerta sobre conexoes de dispositivos USB nao autorizados',
  true, 2
FROM tenants t WHERE t.id IN (SELECT DISTINCT a.tenant_id FROM agents a)
ON CONFLICT DO NOTHING;

INSERT INTO security_policies (tenant_id, name, description, is_active, priority)
SELECT t.id,
  'Restricao de Software',
  'Bloqueia e alerta sobre execucao de software nao aprovado pela organizacao',
  true, 3
FROM tenants t WHERE t.id IN (SELECT DISTINCT a.tenant_id FROM agents a)
ON CONFLICT DO NOTHING;

INSERT INTO security_policies (tenant_id, name, description, is_active, priority)
SELECT t.id,
  'Politica de Horario',
  'Monitora e alerta sobre atividade fora do horario comercial definido',
  true, 4
FROM tenants t WHERE t.id IN (SELECT DISTINCT a.tenant_id FROM agents a)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- FASE 5: Triggers para Decision Events Automaticos
-- =============================================================================

-- 5.1 Trigger para ai_insights
CREATE OR REPLACE FUNCTION generate_insight_decision_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO decision_events (
    tenant_id, rule_code, action, 
    agent_ids, severity, evidence, 
    actions_executed
  ) VALUES (
    NEW.tenant_id,
    'INSIGHT_GENERATED',
    'create_insight',
    CASE WHEN NEW.agent_id IS NOT NULL THEN ARRAY[NEW.agent_id] ELSE ARRAY[]::uuid[] END,
    COALESCE(NEW.severity, 'low'),
    jsonb_build_object(
      'source', 'ai_insight_trigger',
      'insight_id', NEW.id,
      'insight_type', NEW.insight_type,
      'title', NEW.title
    ),
    ARRAY['insight_created']::text[]
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS trg_insight_decision_event ON ai_insights;
CREATE TRIGGER trg_insight_decision_event
AFTER INSERT ON ai_insights
FOR EACH ROW
EXECUTE FUNCTION generate_insight_decision_event();

-- 5.2 Trigger para policy_enforcement_logs
CREATE OR REPLACE FUNCTION generate_enforcement_decision_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO decision_events (
    tenant_id, rule_code, action,
    agent_ids, severity, evidence,
    actions_executed
  ) VALUES (
    NEW.tenant_id,
    'POLICY_ENFORCED',
    NEW.action_taken,
    CASE WHEN NEW.agent_id IS NOT NULL THEN ARRAY[NEW.agent_id] ELSE ARRAY[]::uuid[] END,
    CASE WHEN NEW.blocked THEN 'medium' ELSE 'low' END,
    jsonb_build_object(
      'source', 'policy_enforcement_trigger',
      'policy_id', NEW.policy_id,
      'rule_type', NEW.rule_type,
      'target', NEW.target
    ),
    ARRAY[NEW.action_taken]::text[]
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS trg_enforcement_decision_event ON policy_enforcement_logs;
CREATE TRIGGER trg_enforcement_decision_event
AFTER INSERT ON policy_enforcement_logs
FOR EACH ROW
EXECUTE FUNCTION generate_enforcement_decision_event();
