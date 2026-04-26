-- FASE 5: SQL Functions para Identificacao e Limpeza de Agentes Problematicos

-- View materializada para identificar agentes problematicos
CREATE OR REPLACE VIEW v_problematic_agents AS
SELECT 
  a.id,
  a.agent_name,
  a.status,
  a.enrolled_at,
  a.last_heartbeat,
  a.tenant_id,
  t.name as tenant_name,
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at)) / 60 AS minutes_since_enrollment,
  CASE 
    WHEN a.last_heartbeat IS NULL THEN 'never_connected'
    WHEN a.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN 'stale_heartbeat'
    ELSE 'ok'
  END AS issue_type,
  COUNT(at.id) AS token_count,
  MAX(at.is_active::int) AS has_active_token,
  (SELECT COUNT(*) FROM jobs j WHERE j.agent_id = a.id AND j.status IN ('queued', 'delivered')) AS pending_jobs_count
FROM agents a
LEFT JOIN agent_tokens at ON at.agent_id = a.id
LEFT JOIN tenants t ON t.id = a.tenant_id
WHERE a.status = 'pending'
  AND a.last_heartbeat IS NULL
  AND a.enrolled_at < NOW() - INTERVAL '10 minutes'
GROUP BY a.id, a.agent_name, a.status, a.enrolled_at, a.last_heartbeat, a.tenant_id, t.name;

-- Function para limpar um agente especifico
CREATE OR REPLACE FUNCTION cleanup_problematic_agent(p_agent_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_name TEXT;
  v_tenant_id UUID;
  v_tokens_invalidated INT;
  v_jobs_deleted INT;
BEGIN
  -- Buscar informacoes do agente
  SELECT agent_name, tenant_id INTO v_agent_name, v_tenant_id
  FROM agents
  WHERE id = p_agent_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agent not found',
      'agent_id', p_agent_id
    );
  END IF;
  
  -- Invalidar tokens antigos
  UPDATE agent_tokens 
  SET is_active = false 
  WHERE agent_id = p_agent_id;
  
  GET DIAGNOSTICS v_tokens_invalidated = ROW_COUNT;
  
  -- Remover jobs pendentes
  DELETE FROM jobs 
  WHERE agent_id = p_agent_id 
    AND status IN ('queued', 'delivered');
  
  GET DIAGNOSTICS v_jobs_deleted = ROW_COUNT;
  
  -- Resetar status do agente
  UPDATE agents 
  SET 
    status = 'pending',
    last_heartbeat = NULL
  WHERE id = p_agent_id;
  
  -- Log da operacao
  INSERT INTO audit_logs (
    tenant_id,
    user_id,
    action,
    resource_type,
    resource_id,
    success,
    details
  ) VALUES (
    v_tenant_id,
    auth.uid(),
    'cleanup_agent',
    'agent',
    p_agent_id::text,
    true,
    jsonb_build_object(
      'agent_name', v_agent_name,
      'tokens_invalidated', v_tokens_invalidated,
      'jobs_deleted', v_jobs_deleted
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'agent_name', v_agent_name,
    'tokens_invalidated', v_tokens_invalidated,
    'jobs_deleted', v_jobs_deleted
  );
END;
$$;

-- Function para limpar todos os agentes problematicos de um tenant
CREATE OR REPLACE FUNCTION cleanup_all_problematic_agents(p_tenant_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_record RECORD;
  v_results jsonb[] := '{}';
  v_total_cleaned INT := 0;
BEGIN
  -- Verificar permissao (apenas admin do tenant)
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant_id
      AND role IN ('admin', 'super_admin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;
  
  -- Limpar cada agente problematico
  FOR v_agent_record IN 
    SELECT id, agent_name 
    FROM v_problematic_agents
    WHERE tenant_id = p_tenant_id
  LOOP
    v_results := v_results || cleanup_problematic_agent(v_agent_record.id);
    v_total_cleaned := v_total_cleaned + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_cleaned', v_total_cleaned,
    'results', v_results
  );
END;
$$;

-- Function para diagnostico rapido de um agente
CREATE OR REPLACE FUNCTION diagnose_agent(p_agent_name TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent RECORD;
  v_token_info RECORD;
  v_jobs_info RECORD;
  v_issues jsonb[] := '{}';
BEGIN
  -- Buscar agente
  SELECT * INTO v_agent
  FROM agents
  WHERE agent_name = p_agent_name;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agent not found',
      'agent_name', p_agent_name
    );
  END IF;
  
  -- Verificar tokens
  SELECT 
    COUNT(*) as total_tokens,
    COUNT(*) FILTER (WHERE is_active = true) as active_tokens,
    MAX(created_at) as last_token_created
  INTO v_token_info
  FROM agent_tokens
  WHERE agent_id = v_agent.id;
  
  IF v_token_info.active_tokens = 0 THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'no_active_token',
      'severity', 'critical',
      'message', 'No active tokens found for this agent'
    );
  END IF;
  
  -- Verificar heartbeat
  IF v_agent.last_heartbeat IS NULL THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'never_connected',
      'severity', 'critical',
      'message', 'Agent never sent a heartbeat',
      'enrolled_at', v_agent.enrolled_at
    );
  ELSIF v_agent.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'stale_heartbeat',
      'severity', 'high',
      'message', 'Last heartbeat was more than 10 minutes ago',
      'last_heartbeat', v_agent.last_heartbeat,
      'minutes_ago', EXTRACT(EPOCH FROM (NOW() - v_agent.last_heartbeat)) / 60
    );
  END IF;
  
  -- Verificar jobs pendentes
  SELECT 
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'queued') as queued_jobs,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs
  INTO v_jobs_info
  FROM jobs
  WHERE agent_id = v_agent.id;
  
  IF v_jobs_info.delivered_jobs > 0 THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'stuck_jobs',
      'severity', 'medium',
      'message', format('%s jobs stuck in delivered state', v_jobs_info.delivered_jobs)
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'agent', jsonb_build_object(
      'id', v_agent.id,
      'name', v_agent.agent_name,
      'status', v_agent.status,
      'enrolled_at', v_agent.enrolled_at,
      'last_heartbeat', v_agent.last_heartbeat,
      'os_type', v_agent.os_type
    ),
    'tokens', v_token_info,
    'jobs', v_jobs_info,
    'issues', v_issues,
    'is_healthy', array_length(v_issues, 1) IS NULL
  );
END;
$$;

COMMENT ON VIEW v_problematic_agents IS 'View para identificar agentes com problemas (pending sem heartbeat por >10min)';
COMMENT ON FUNCTION cleanup_problematic_agent IS 'Limpa um agente problematico especifico (invalida tokens, remove jobs pendentes, reseta status)';
COMMENT ON FUNCTION cleanup_all_problematic_agents IS 'Limpa todos os agentes problematicos de um tenant';
COMMENT ON FUNCTION diagnose_agent IS 'Diagnostico completo de um agente especifico';