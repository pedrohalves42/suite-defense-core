-- ============================================================
-- 1. TRIGGER: Auto-cancelar jobs de agentes offline (>24h)
-- ============================================================

-- Funcao para cancelar jobs quando agente fica offline
CREATE OR REPLACE FUNCTION public.cancel_jobs_on_agent_offline()
RETURNS trigger AS $$
BEGIN
  -- Se heartbeat esta NULL ou muito antigo, cancelar jobs pendentes
  IF NEW.last_heartbeat IS NULL OR NEW.last_heartbeat < NOW() - INTERVAL '24 hours' THEN
    UPDATE public.jobs
    SET 
      status = 'cancelled',
      error_message = 'Auto-cancelled: agent offline >24h',
      completed_at = NOW()
    WHERE agent_id = NEW.id
      AND status IN ('queued', 'delivered');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger (drop se existir para idempotencia)
DROP TRIGGER IF EXISTS trg_cancel_jobs_offline ON public.agents;

CREATE TRIGGER trg_cancel_jobs_offline
AFTER UPDATE OF last_heartbeat ON public.agents
FOR EACH ROW
EXECUTE FUNCTION public.cancel_jobs_on_agent_offline();

-- ============================================================
-- 2. FUNCAO: Reprocessar jobs com output que nao geraram dados
-- ============================================================

CREATE OR REPLACE FUNCTION public.reprocess_job_outputs(p_hours_back integer DEFAULT 48)
RETURNS TABLE(
  job_id uuid, 
  job_type text, 
  agent_name text,
  output_type text,
  needs_reprocessing boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id as job_id,
    j.type as job_type,
    j.agent_name,
    pg_typeof(j.output)::text as output_type,
    true as needs_reprocessing
  FROM public.jobs j
  WHERE j.status = 'completed'
    AND j.output IS NOT NULL
    AND j.type IN ('collect_web_activity', 'software_inventory_collect', 'collect_antivirus_status')
    AND j.created_at > NOW() - (p_hours_back || ' hours')::interval
    AND (
      -- Jobs de web_activity sem dados correspondentes
      (j.type = 'collect_web_activity' AND NOT EXISTS (
        SELECT 1 FROM public.agent_web_activity aw 
        WHERE aw.agent_id = j.agent_id 
          AND aw.created_at > j.created_at - INTERVAL '1 hour'
      ))
      OR
      -- Jobs de software_inventory sem dados correspondentes  
      (j.type = 'software_inventory_collect' AND NOT EXISTS (
        SELECT 1 FROM public.software_inventory si 
        WHERE si.agent_id = j.agent_id 
          AND si.collected_at > j.created_at - INTERVAL '1 hour'
      ))
      OR
      -- Jobs de antivirus sem dados correspondentes
      (j.type = 'collect_antivirus_status' AND NOT EXISTS (
        SELECT 1 FROM public.antivirus_status av 
        WHERE av.agent_id = j.agent_id 
          AND av.collected_at > j.created_at - INTERVAL '1 hour'
      ))
    )
  ORDER BY j.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. FUNCAO: Cleanup dinamico de HMAC signatures antigas
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_hmac_signatures()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.hmac_signatures 
  WHERE used_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'HMAC cleanup: % signatures deleted', deleted_count;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 4. EXECUTAR: Cancelar jobs stuck agora (one-time cleanup)
-- ============================================================

UPDATE public.jobs
SET
  status = 'cancelled',
  error_message = 'Auto-cancelled: agent offline >24h (initial cleanup)',
  completed_at = NOW()
WHERE status IN ('queued', 'delivered')
  AND agent_id IN (
    SELECT id FROM public.agents
    WHERE last_heartbeat IS NULL
       OR last_heartbeat < NOW() - INTERVAL '24 hours'
  );

-- ============================================================
-- 5. INDICE: Otimizar queries de jobs por status e agent
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_jobs_status_agent_id 
ON public.jobs(status, agent_id) 
WHERE status IN ('queued', 'delivered');