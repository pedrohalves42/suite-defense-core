-- Funcao para cancelar automaticamente jobs pendentes quando um agente fica offline
CREATE OR REPLACE FUNCTION public.auto_cancel_jobs_on_agent_offline()
RETURNS TRIGGER AS $$
DECLARE
  cancelled_count INTEGER;
BEGIN
  -- Verifica se o agente ficou offline (heartbeat antigo ou null)
  -- Considera offline se: nao tinha heartbeat antes OU heartbeat ficou > 30 minutos
  IF (OLD.last_heartbeat IS NOT NULL AND OLD.last_heartbeat > NOW() - INTERVAL '30 minutes')
     AND (NEW.last_heartbeat IS NULL OR NEW.last_heartbeat < NOW() - INTERVAL '30 minutes') THEN
    
    -- Cancelar jobs pendentes para este agente
    UPDATE public.jobs 
    SET 
      status = 'cancelled', 
      error_message = 'Cancelado automaticamente - agente offline',
      completed_at = NOW()
    WHERE agent_id = NEW.id 
      AND status IN ('queued', 'pending', 'delivered')
      AND completed_at IS NULL;
    
    GET DIAGNOSTICS cancelled_count = ROW_COUNT;
    
    -- Log se houver jobs cancelados
    IF cancelled_count > 0 THEN
      INSERT INTO public.security_logs (
        tenant_id,
        event_type,
        event_description,
        severity,
        source_ip,
        user_agent,
        metadata
      ) VALUES (
        NEW.tenant_id,
        'jobs_auto_cancelled',
        format('%s jobs cancelados automaticamente para agente offline: %s', cancelled_count, NEW.agent_name),
        'info',
        '127.0.0.1',
        'system_trigger',
        jsonb_build_object(
          'agent_id', NEW.id,
          'agent_name', NEW.agent_name,
          'cancelled_count', cancelled_count,
          'reason', 'agent_offline'
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para execucao automatica
DROP TRIGGER IF EXISTS trg_auto_cancel_jobs_on_offline ON public.agents;
CREATE TRIGGER trg_auto_cancel_jobs_on_offline
  AFTER UPDATE OF last_heartbeat ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_cancel_jobs_on_agent_offline();

-- Comentario explicativo
COMMENT ON FUNCTION public.auto_cancel_jobs_on_agent_offline() IS 
'Cancela automaticamente jobs pendentes quando um agente fica offline (sem heartbeat ha mais de 30 minutos)';