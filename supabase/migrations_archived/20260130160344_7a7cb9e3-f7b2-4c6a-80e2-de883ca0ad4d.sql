-- Fase A: Corrigir Transicao de Estado de Jobs (P0 - CRITICO)
-- Adiciona a transicao pending ? delivered que era bloqueada

CREATE OR REPLACE FUNCTION public.enforce_job_state_transitions()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_transitions jsonb := '{
    "pending": ["queued", "delivered", "cancelled", "failed"],
    "queued": ["delivered", "failed", "cancelled"],
    "delivered": ["completed", "failed", "cancelled"],
    "completed": ["archived"],
    "failed": ["archived"],
    "cancelled": ["archived"]
  }'::jsonb;
  v_allowed_states jsonb;
BEGIN
  -- Allow same-state updates
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  v_allowed_states := v_valid_transitions->OLD.status;
  
  IF v_allowed_states IS NULL OR NOT v_allowed_states ? NEW.status THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Cannot transition from % to %. Allowed: %',
      OLD.status, NEW.status, COALESCE(v_allowed_states, '[]'::jsonb)
    USING ERRCODE = '23514';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fase D: Criar RPC para criar jobs em massa para todos os agentes online
CREATE OR REPLACE FUNCTION public.create_jobs_for_all_agents(
  p_tenant_id uuid,
  p_job_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS integer 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_agent RECORD;
BEGIN
  -- Valida tenant_id
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;
  
  -- Para cada agente online do tenant, cria um job
  FOR v_agent IN
    SELECT id, agent_name 
    FROM agents 
    WHERE tenant_id = p_tenant_id 
      AND archived_at IS NULL
      AND status = 'active'
      AND last_heartbeat > NOW() - INTERVAL '5 minutes'
  LOOP
    INSERT INTO jobs (
      tenant_id, 
      agent_id, 
      agent_name, 
      type, 
      payload, 
      status, 
      approved,
      expires_at
    )
    VALUES (
      p_tenant_id, 
      v_agent.id, 
      v_agent.agent_name, 
      p_job_type, 
      p_payload, 
      'queued', 
      true,
      NOW() + INTERVAL '1 hour'
    );
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- Concede acesso a RPC para usuarios autenticados
GRANT EXECUTE ON FUNCTION public.create_jobs_for_all_agents(uuid, text, jsonb) TO authenticated;