-- Atualizar a função de diagnóstico para ser compatível com o Edge Gateway
CREATE OR REPLACE FUNCTION public.diagnose_agent(p_agent_name TEXT, p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_catalog, pg_temp
AS $$
DECLARE
  v_agent RECORD;
  v_token_info RECORD;
  v_jobs_info RECORD;
  v_issues jsonb[] := '{}';
  v_effective_tenant_id uuid;
BEGIN
  -- Determinar o tenant ID efetivo (prioridade para o parâmetro p_tenant_id se for super admin ou chamado via gateway)
  -- Se p_tenant_id não for fornecido, tenta pegar do auth.uid() (chamada direta via PostgREST)
  v_effective_tenant_id := p_tenant_id;
  
  IF v_effective_tenant_id IS NULL THEN
    SELECT tenant_id INTO v_effective_tenant_id 
    FROM user_roles 
    WHERE user_id = auth.uid() 
    LIMIT 1;
  END IF;
  
  IF v_effective_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Tenant context missing'
    );
  END IF;

  -- Buscar agente filtrando por tenant (ESSENCIAL)
  SELECT * INTO v_agent
  FROM agents
  WHERE agent_name = p_agent_name
    AND tenant_id = v_effective_tenant_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agent not found in the specified tenant context',
      'agent_name', p_agent_name,
      'tenant_id', v_effective_tenant_id
    );
  END IF;
  
  -- Token checks
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
  
  -- Heartbeat checks
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
  
  -- Jobs checks
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
