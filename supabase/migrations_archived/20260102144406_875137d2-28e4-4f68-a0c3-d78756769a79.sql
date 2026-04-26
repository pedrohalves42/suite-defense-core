-- =====================================================
-- PARTE A: Criar RPCs para Arquivar e Excluir Definitivo
-- =====================================================

-- Adicionar coluna archived_at se nao existir
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS archived_reason TEXT;

-- Funcao para ARQUIVAR agente (soft delete)
CREATE OR REPLACE FUNCTION public.archive_agent(p_agent_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_result JSON;
BEGIN
  -- Verificar se agente existe
  SELECT id, agent_name, tenant_id, status INTO v_agent
  FROM agents WHERE id = p_agent_id;
  
  IF v_agent.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'AGENT_NOT_FOUND');
  END IF;
  
  -- Desativar todos os tokens
  UPDATE agent_tokens SET is_active = false WHERE agent_id = p_agent_id;
  
  -- Marcar agente como inativo/arquivado
  UPDATE agents SET
    status = 'inactive',
    archived_at = NOW(),
    archived_reason = 'manual_archive',
    agent_state = 'archived',
    agent_state_changed_at = NOW(),
    agent_state_reason = 'Arquivado manualmente pelo administrador'
  WHERE id = p_agent_id;
  
  -- Limpar dados nao-auditaveis (cache, metricas recentes, etc.)
  DELETE FROM agent_disk_metrics WHERE agent_id = p_agent_id;
  DELETE FROM agent_network_info WHERE agent_id = p_agent_id;
  DELETE FROM agent_system_metrics WHERE agent_id = p_agent_id;
  DELETE FROM agent_web_activity WHERE agent_id = p_agent_id;
  DELETE FROM system_alerts WHERE agent_id = p_agent_id;
  DELETE FROM ai_insights WHERE agent_id = p_agent_id;
  
  RETURN json_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'agent_name', v_agent.agent_name,
    'action', 'archived'
  );
END;
$$;

-- Funcao para verificar se pode excluir definitivamente
CREATE OR REPLACE FUNCTION public.can_hard_delete_agent(p_agent_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_exec_count INT;
  v_oldest_allowed TIMESTAMPTZ;
  v_blocked_until TIMESTAMPTZ;
BEGIN
  -- Periodo de retencao: 30 dias
  v_oldest_allowed := NOW() - INTERVAL '30 days';
  
  -- Verificar job_executions (tabela imutavel principal)
  SELECT COUNT(*), MAX(created_at) + INTERVAL '30 days'
  INTO v_job_exec_count, v_blocked_until
  FROM job_executions
  WHERE agent_id = p_agent_id AND created_at > v_oldest_allowed;
  
  IF v_job_exec_count > 0 THEN
    RETURN json_build_object(
      'can_delete', false,
      'reason', 'AUDIT_RETENTION',
      'blocked_records', v_job_exec_count,
      'blocked_until', v_blocked_until,
      'message', 'Existem ' || v_job_exec_count || ' registros de auditoria que nao podem ser excluidos ate ' || TO_CHAR(v_blocked_until, 'DD/MM/YYYY')
    );
  END IF;
  
  RETURN json_build_object('can_delete', true);
END;
$$;

-- Funcao para EXCLUIR DEFINITIVAMENTE (so se permitido)
CREATE OR REPLACE FUNCTION public.hard_delete_agent(p_agent_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_delete JSON;
  v_agent RECORD;
BEGIN
  -- Primeiro verificar se pode excluir
  v_can_delete := can_hard_delete_agent(p_agent_id);
  
  IF NOT (v_can_delete->>'can_delete')::BOOLEAN THEN
    RETURN v_can_delete;
  END IF;
  
  -- Buscar info do agente
  SELECT id, agent_name INTO v_agent FROM agents WHERE id = p_agent_id;
  
  IF v_agent.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'AGENT_NOT_FOUND');
  END IF;
  
  -- Excluir em ordem de dependencia (tabelas sem auditoria imutavel)
  DELETE FROM agent_tokens WHERE agent_id = p_agent_id;
  DELETE FROM agent_signing_keys WHERE agent_id = p_agent_id;
  DELETE FROM agents_groups WHERE agent_id = p_agent_id;
  DELETE FROM agent_disk_metrics WHERE agent_id = p_agent_id;
  DELETE FROM agent_network_info WHERE agent_id = p_agent_id;
  DELETE FROM agent_system_metrics WHERE agent_id = p_agent_id;
  DELETE FROM software_inventory WHERE agent_id = p_agent_id;
  DELETE FROM antivirus_status WHERE agent_id = p_agent_id;
  DELETE FROM agent_web_activity WHERE agent_id = p_agent_id;
  DELETE FROM blocked_access_attempts WHERE agent_id = p_agent_id;
  DELETE FROM security_events WHERE agent_id = p_agent_id;
  DELETE FROM system_alerts WHERE agent_id = p_agent_id;
  DELETE FROM ai_insights WHERE agent_id = p_agent_id;
  DELETE FROM anomaly_events WHERE agent_id = p_agent_id;
  DELETE FROM network_anomalies WHERE agent_id = p_agent_id;
  DELETE FROM agent_update_decisions WHERE agent_id = p_agent_id;
  DELETE FROM agent_rollback_events WHERE agent_id = p_agent_id;
  DELETE FROM agent_safe_mode_events WHERE agent_id = p_agent_id;
  DELETE FROM agent_recovery_authorizations WHERE agent_id = p_agent_id;
  DELETE FROM scheduled_jobs WHERE agent_id = p_agent_id;
  DELETE FROM jobs WHERE agent_id = p_agent_id;
  DELETE FROM failed_jobs_dlq WHERE agent_id = p_agent_id;
  DELETE FROM forensic_snapshots WHERE agent_id = p_agent_id;
  DELETE FROM policy_enforcement_logs WHERE agent_id = p_agent_id;
  DELETE FROM vuln_findings WHERE agent_id = p_agent_id;
  DELETE FROM agent_timeline_events WHERE agent_id = p_agent_id;
  DELETE FROM agent_execution_chain WHERE agent_id = p_agent_id;
  DELETE FROM agent_evidence_logs WHERE agent_id = p_agent_id;
  DELETE FROM poe_chain_breaks WHERE agent_id = p_agent_id;
  DELETE FROM job_executions WHERE agent_id = p_agent_id;
  
  -- Finalmente excluir o agente
  DELETE FROM agents WHERE id = p_agent_id;
  
  RETURN json_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'agent_name', v_agent.agent_name,
    'action', 'hard_deleted'
  );
END;
$$;

-- Funcao para REVIVER agente no reenrollment
CREATE OR REPLACE FUNCTION public.revive_agent_on_reenroll(p_agent_id UUID, p_new_hmac_secret TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
BEGIN
  SELECT id, agent_name INTO v_agent FROM agents WHERE id = p_agent_id;
  
  IF v_agent.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'AGENT_NOT_FOUND');
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

-- Grants
GRANT EXECUTE ON FUNCTION public.archive_agent(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_hard_delete_agent(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_agent(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revive_agent_on_reenroll(UUID, TEXT) TO authenticated;