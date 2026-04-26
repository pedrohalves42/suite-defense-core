-- FASE CORRECAO: Trigger robusto para cancelamento de jobs de agentes offline

-- Remover trigger antigo (se existir)
DROP TRIGGER IF EXISTS trg_cancel_jobs_offline ON public.agents;

-- Recriar trigger com sintaxe robusta
-- WHEN (NEW.last_heartbeat IS DISTINCT FROM OLD.last_heartbeat) 
-- funciona tanto para UPDATE de valor quanto para quando volta de NULL
CREATE TRIGGER trg_cancel_jobs_offline
AFTER UPDATE ON public.agents
FOR EACH ROW
WHEN (NEW.last_heartbeat IS DISTINCT FROM OLD.last_heartbeat)
EXECUTE FUNCTION public.cancel_jobs_on_agent_offline();

-- Criar funcao para cleanup proativo de jobs de agentes offline
-- Esta funcao sera chamada por edge function scheduled
CREATE OR REPLACE FUNCTION public.cleanup_offline_agents_jobs()
RETURNS TABLE(cleaned_count INTEGER, agent_ids UUID[], job_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cleaned_count INTEGER;
  v_agent_ids UUID[];
  v_job_ids UUID[];
BEGIN
  -- Buscar agentes offline (>24h sem heartbeat)
  WITH offline_agents AS (
    SELECT id 
    FROM public.agents
    WHERE last_heartbeat IS NULL 
       OR last_heartbeat < NOW() - INTERVAL '24 hours'
  ),
  -- Cancelar jobs desses agentes
  cancelled_jobs AS (
    UPDATE public.jobs
    SET 
      status = 'cancelled',
      error_message = 'Auto-cancelled: agent offline >24h (scheduled cleanup)',
      completed_at = NOW()
    WHERE status IN ('queued', 'delivered')
      AND agent_id IN (SELECT id FROM offline_agents)
    RETURNING id, agent_id
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(DISTINCT agent_id),
    ARRAY_AGG(id)
  INTO v_cleaned_count, v_agent_ids, v_job_ids
  FROM cancelled_jobs;
  
  -- Log da operacao
  IF v_cleaned_count > 0 THEN
    RAISE NOTICE 'Cleanup completed: % jobs cancelled for offline agents', v_cleaned_count;
  END IF;
  
  RETURN QUERY SELECT 
    COALESCE(v_cleaned_count, 0),
    COALESCE(v_agent_ids, ARRAY[]::UUID[]),
    COALESCE(v_job_ids, ARRAY[]::UUID[]);
END;
$$;