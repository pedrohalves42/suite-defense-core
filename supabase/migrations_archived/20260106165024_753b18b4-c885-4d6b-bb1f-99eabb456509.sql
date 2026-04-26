-- Criar funcao para notificar edge function de avaliacao de playbooks
CREATE OR REPLACE FUNCTION public.trigger_playbook_evaluation_on_job_failure()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  job_record RECORD;
  failure_count_24h INTEGER;
BEGIN
  -- Apenas processa se o status for 'failed'
  IF NEW.status != 'failed' THEN
    RETURN NEW;
  END IF;
  
  -- Buscar informacoes do job
  SELECT type, tenant_id INTO job_record
  FROM jobs
  WHERE id = NEW.job_id;
  
  -- Contar falhas nas ultimas 24 horas para este job
  SELECT COUNT(*) INTO failure_count_24h
  FROM job_executions
  WHERE job_id = NEW.job_id
    AND status = 'failed'
    AND created_at > NOW() - INTERVAL '24 hours';
  
  -- Inserir evento para processamento de playbook
  INSERT INTO ai_action_logs (
    tenant_id,
    action_type,
    action_data,
    status,
    created_at
  ) VALUES (
    NEW.tenant_id,
    'playbook_trigger_evaluation',
    jsonb_build_object(
      'trigger_type', 'job_failed',
      'job_execution_id', NEW.id,
      'job_id', NEW.job_id,
      'job_type', job_record.type,
      'agent_id', NEW.agent_id,
      'failure_count_24h', failure_count_24h,
      'error_message', NEW.error_message,
      'evaluated_at', NOW()
    ),
    'pending',
    NOW()
  );
  
  RETURN NEW;
END;
$$;

-- Criar trigger para falhas de job
DROP TRIGGER IF EXISTS tr_playbook_on_job_failure ON job_executions;
CREATE TRIGGER tr_playbook_on_job_failure
AFTER INSERT OR UPDATE ON job_executions
FOR EACH ROW
WHEN (NEW.status = 'failed')
EXECUTE FUNCTION public.trigger_playbook_evaluation_on_job_failure();

-- Criar funcao para verificar agentes offline periodicamente
CREATE OR REPLACE FUNCTION public.check_offline_agents_for_playbook()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  agent_record RECORD;
BEGIN
  -- Buscar agentes offline por mais de 24 horas
  FOR agent_record IN
    SELECT 
      a.id,
      a.name,
      a.tenant_id,
      a.last_seen,
      EXTRACT(EPOCH FROM (NOW() - a.last_seen)) / 3600 AS hours_offline
    FROM agents a
    WHERE a.is_archived = false
      AND a.last_seen < NOW() - INTERVAL '24 hours'
      AND a.last_seen > NOW() - INTERVAL '48 hours' -- Apenas agentes que ficaram offline recentemente
  LOOP
    -- Verificar se ja existe um log recente para este agente
    IF NOT EXISTS (
      SELECT 1 FROM ai_action_logs
      WHERE tenant_id = agent_record.tenant_id
        AND action_type = 'playbook_trigger_evaluation'
        AND (action_data->>'agent_id')::uuid = agent_record.id
        AND (action_data->>'trigger_type')::text = 'agent_offline'
        AND created_at > NOW() - INTERVAL '24 hours'
    ) THEN
      INSERT INTO ai_action_logs (
        tenant_id,
        action_type,
        action_data,
        status,
        created_at
      ) VALUES (
        agent_record.tenant_id,
        'playbook_trigger_evaluation',
        jsonb_build_object(
          'trigger_type', 'agent_offline',
          'agent_id', agent_record.id,
          'agent_name', agent_record.name,
          'hours_offline', agent_record.hours_offline,
          'last_seen', agent_record.last_seen,
          'evaluated_at', NOW()
        ),
        'pending',
        NOW()
      );
    END IF;
  END LOOP;
END;
$$;

-- Comentario para documentacao
COMMENT ON FUNCTION public.trigger_playbook_evaluation_on_job_failure() IS 
'Trigger que registra eventos de falha de job para avaliacao de playbooks automatizada';

COMMENT ON FUNCTION public.check_offline_agents_for_playbook() IS 
'Funcao que verifica agentes offline e registra eventos para avaliacao de playbooks';