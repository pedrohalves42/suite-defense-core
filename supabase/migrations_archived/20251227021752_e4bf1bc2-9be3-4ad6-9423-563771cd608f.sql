-- ==============================================
-- SAFE_MODE AUTONOMO - FASE 1
-- Entrada automatica em SAFE_MODE quando:
-- 1. 3+ falhas criticas em 10 minutos
-- 2. Mesmo tipo de falha
-- 3. Agente ainda responde heartbeat
-- ==============================================

-- Funcao para detectar padrao de falhas repetidas
CREATE OR REPLACE FUNCTION public.detect_critical_failure_pattern(
  p_window_minutes INTEGER DEFAULT 10,
  p_min_failures INTEGER DEFAULT 3
)
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  tenant_id UUID,
  failure_type TEXT,
  failure_count BIGINT,
  first_failure TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ,
  heartbeat_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH recent_failures AS (
    -- Buscar execucoes falhadas nos ultimos N minutos
    SELECT 
      je.agent_id,
      je.agent_name,
      je.tenant_id,
      je.error_code AS failure_type,
      je.created_at
    FROM job_executions je
    WHERE je.execution_status = 'error'
      AND je.created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL
      AND je.error_code IS NOT NULL
    
    UNION ALL
    
    -- Incluir jobs falhados tambem
    SELECT 
      j.agent_id,
      j.agent_name,
      j.tenant_id,
      j.type AS failure_type,  -- Tipo do job como categoria
      j.completed_at
    FROM jobs j
    WHERE j.status = 'failed'
      AND j.completed_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL
  ),
  failure_patterns AS (
    SELECT 
      rf.agent_id,
      rf.agent_name,
      rf.tenant_id,
      rf.failure_type,
      COUNT(*) AS failure_count,
      MIN(rf.created_at) AS first_failure,
      MAX(rf.created_at) AS last_failure
    FROM recent_failures rf
    GROUP BY rf.agent_id, rf.agent_name, rf.tenant_id, rf.failure_type
    HAVING COUNT(*) >= p_min_failures
  )
  SELECT 
    fp.agent_id,
    fp.agent_name,
    fp.tenant_id,
    fp.failure_type,
    fp.failure_count,
    fp.first_failure,
    fp.last_failure,
    a.last_heartbeat,
    -- Agente e considerado ativo se teve heartbeat nos ultimos 5 minutos
    CASE 
      WHEN a.last_heartbeat > NOW() - INTERVAL '5 minutes' THEN TRUE
      ELSE FALSE
    END AS heartbeat_active
  FROM failure_patterns fp
  JOIN agents a ON a.id = fp.agent_id
  WHERE a.agent_mode IS DISTINCT FROM 'SAFE_MODE'  -- Nao ja esta em SAFE_MODE
    AND a.status IN ('active', 'pending')
    -- So agentes com heartbeat recente (ainda respondendo)
    AND a.last_heartbeat > NOW() - INTERVAL '5 minutes';
END;
$$;

-- Funcao para entrar em SAFE_MODE autonomamente
CREATE OR REPLACE FUNCTION public.enter_autonomous_safe_mode(
  p_agent_id UUID,
  p_reason TEXT,
  p_failure_type TEXT,
  p_failure_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_name TEXT;
  v_tenant_id UUID;
  v_agent_version TEXT;
  v_event_id UUID;
BEGIN
  -- Buscar dados do agente
  SELECT agent_name, tenant_id, agent_version
  INTO v_agent_name, v_tenant_id, v_agent_version
  FROM agents
  WHERE id = p_agent_id;
  
  IF v_agent_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found');
  END IF;
  
  -- Atualizar agente para SAFE_MODE
  UPDATE agents
  SET 
    agent_mode = 'SAFE_MODE',
    safe_mode_entered_at = NOW(),
    safe_mode_reason = p_reason
  WHERE id = p_agent_id;
  
  -- Registrar evento de SAFE_MODE
  INSERT INTO agent_safe_mode_events (
    agent_id,
    tenant_id,
    entered_at,
    reason,
    agent_version,
    failure_count
  ) VALUES (
    p_agent_id,
    v_tenant_id,
    NOW(),
    p_reason,
    v_agent_version,
    p_failure_count
  )
  RETURNING id INTO v_event_id;
  
  -- Criar alerta de sistema
  INSERT INTO system_alerts (
    tenant_id,
    agent_id,
    alert_type,
    severity,
    message,
    source,
    details
  ) VALUES (
    v_tenant_id,
    p_agent_id,
    'autonomous_safe_mode',
    'high',
    format('Agente %s entrou automaticamente em SAFE_MODE: %s', v_agent_name, p_reason),
    'autonomous_safe_mode_system',
    jsonb_build_object(
      'agent_id', p_agent_id,
      'agent_name', v_agent_name,
      'failure_type', p_failure_type,
      'failure_count', p_failure_count,
      'safe_mode_event_id', v_event_id,
      'triggered_at', NOW()
    )
  );
  
  -- Criar AI Insight
  INSERT INTO ai_insights (
    tenant_id,
    agent_id,
    insight_type,
    severity,
    title,
    description,
    recommended_action,
    data
  ) VALUES (
    v_tenant_id,
    p_agent_id,
    'safety',
    'critical',
    format('SAFE_MODE ativado automaticamente: %s', v_agent_name),
    format('O agente %s foi colocado em SAFE_MODE automaticamente apos detectar %s falhas do tipo "%s" nos ultimos 10 minutos. Apenas jobs de diagnostico sao permitidos.', 
      v_agent_name, p_failure_count, p_failure_type),
    'Verificar logs do agente, diagnosticar a causa raiz das falhas e resolver antes de desativar o SAFE_MODE.',
    jsonb_build_object(
      'trigger', 'autonomous',
      'failure_type', p_failure_type,
      'failure_count', p_failure_count,
      'safe_mode_event_id', v_event_id
    )
  );
  
  -- Log de auditoria
  INSERT INTO audit_logs (
    tenant_id,
    action,
    resource_type,
    resource_id,
    success,
    details
  ) VALUES (
    v_tenant_id,
    'autonomous_safe_mode_entry',
    'agent',
    p_agent_id::TEXT,
    true,
    jsonb_build_object(
      'agent_name', v_agent_name,
      'reason', p_reason,
      'failure_type', p_failure_type,
      'failure_count', p_failure_count,
      'autonomous', true
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'agent_name', v_agent_name,
    'safe_mode_event_id', v_event_id,
    'reason', p_reason
  );
END;
$$;

-- Funcao principal para processar SAFE_MODE autonomo
CREATE OR REPLACE FUNCTION public.process_autonomous_safe_mode()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent RECORD;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_processed INTEGER := 0;
BEGIN
  -- Processar cada agente com padrao de falha detectado
  FOR v_agent IN 
    SELECT * FROM detect_critical_failure_pattern(10, 3)
    WHERE heartbeat_active = TRUE  -- So agentes que ainda respondem
  LOOP
    -- Entrar em SAFE_MODE
    v_result := enter_autonomous_safe_mode(
      v_agent.agent_id,
      format('Deteccao automatica: %s falhas do tipo "%s" em 10 minutos', 
        v_agent.failure_count, v_agent.failure_type),
      v_agent.failure_type,
      v_agent.failure_count::INTEGER
    );
    
    v_results := v_results || v_result;
    v_processed := v_processed + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed,
    'agents', v_results,
    'executed_at', NOW()
  );
END;
$$;

-- Comentarios
COMMENT ON FUNCTION public.detect_critical_failure_pattern IS 
  'Detecta agentes com padrao de falhas repetidas (P0 SAFE_MODE Autonomo)';
COMMENT ON FUNCTION public.enter_autonomous_safe_mode IS 
  'Coloca um agente em SAFE_MODE autonomamente, com registro e alertas';
COMMENT ON FUNCTION public.process_autonomous_safe_mode IS 
  'Funcao principal que processa entrada autonoma em SAFE_MODE';