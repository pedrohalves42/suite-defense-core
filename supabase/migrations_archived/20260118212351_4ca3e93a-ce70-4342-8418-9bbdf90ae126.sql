-- ADR-029 FASE 1: Correcoes Criticas (P0)

-- CRIT-06: Adicionar validacao de tenant em revive_agent_on_reenroll
CREATE OR REPLACE FUNCTION public.revive_agent_on_reenroll(
  p_agent_id uuid, 
  p_new_hmac_secret text,
  p_expected_tenant_id uuid DEFAULT NULL  -- Novo parametro para validacao cross-tenant
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_agent RECORD;
BEGIN
  -- Buscar agente
  SELECT id, agent_name, tenant_id INTO v_agent 
  FROM agents WHERE id = p_agent_id;
  
  IF v_agent.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'AGENT_NOT_FOUND');
  END IF;
  
  -- CRIT-06: Validacao de tenant para prevenir cross-tenant escalation
  -- Se p_expected_tenant_id foi fornecido, validar que o agente pertence ao tenant correto
  IF p_expected_tenant_id IS NOT NULL AND v_agent.tenant_id IS DISTINCT FROM p_expected_tenant_id THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'TENANT_MISMATCH',
      'message', 'Agent does not belong to the expected tenant'
    );
  END IF;
  
  -- Desativar tokens antigos
  UPDATE agent_tokens SET is_active = false WHERE agent_id = p_agent_id;
  
  -- Reviver agente com estado limpo
  UPDATE agents SET
    status = 'active',
    hmac_secret = p_new_hmac_secret,
    last_heartbeat = NULL,
    agent_state = 'pending_enrollment',
    agent_state_changed_at = NOW(),
    agent_state_reason = 'Reenrollment iniciado',
    is_throttled = false,
    throttle_reason = NULL,
    throttled_at = NULL,
    is_isolated = false,
    isolation_reason = NULL,
    isolated_at = NULL,
    safe_mode_entered_at = NULL,
    safe_mode_reason = NULL,
    offline_detected_at = NULL,
    offline_reason = NULL,
    archived_at = NULL,
    archived_reason = NULL
  WHERE id = p_agent_id;
  
  RETURN json_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'agent_name', v_agent.agent_name,
    'action', 'revived'
  );
END;
$$;

-- ADR-029 FASE 2: Aplicar triggers em tabelas existentes (HIGH-05)
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'custom_trials', 'edge_function_metrics', 'onboarding_progress',
    'playbooks', 'sales_pipeline', 'scheduled_job_runs',
    'slo_alerts', 'slo_measurements', 'system_audits',
    'threat_intelligence_cache', 'governance_adrs', 'marketing_costs',
    'sales_contacts', 'segregation_rules', 'performance_metrics',
    'vendor_risk_registry', 'virus_scans', 'quarantined_files',
    'report_executions', 'reports'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- Verificar se a tabela existe antes de aplicar
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('
        DROP TRIGGER IF EXISTS trg_auto_set_tenant_id_%I ON public.%I;
        CREATE TRIGGER trg_auto_set_tenant_id_%I
          BEFORE INSERT ON public.%I
          FOR EACH ROW EXECUTE FUNCTION public.auto_set_tenant_id();
      ', tbl, tbl, tbl, tbl);
      RAISE NOTICE 'Applied trigger to table: %', tbl;
    ELSE
      RAISE NOTICE 'Table not found, skipping: %', tbl;
    END IF;
  END LOOP;
END $$;

-- ADR-029 FASE 3: Indice de Performance para jobs (existe)
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_type_created 
ON public.jobs (tenant_id, type, created_at DESC);