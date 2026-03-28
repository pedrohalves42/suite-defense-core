-- ============================================
-- P2.3: Backward Compatibility - Executions Retroativas
-- ============================================

-- 1. Adicionar coluna legacy na tabela job_executions
ALTER TABLE public.job_executions
ADD COLUMN IF NOT EXISTS legacy BOOLEAN DEFAULT false;

-- 2. Criar indice para queries de legacy executions
CREATE INDEX IF NOT EXISTS idx_job_executions_legacy 
ON public.job_executions(legacy) WHERE legacy = true;

-- 3. Comentario de documentacao
COMMENT ON COLUMN public.job_executions.legacy IS 
'Flag para executions criadas retroativamente para jobs v1 (sem trilha de auditoria original)';

-- 4. Criar funcao para criar executions retroativas
CREATE OR REPLACE FUNCTION public.create_retroactive_execution(p_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_execution_id UUID;
  v_job RECORD;
BEGIN
  -- Verificar se ja existe execution para este job
  IF EXISTS (
    SELECT 1 FROM job_executions WHERE job_id = p_job_id
  ) THEN
    RAISE NOTICE 'Job % already has execution - skipping', p_job_id;
    RETURN NULL;
  END IF;
  
  -- Buscar dados do job
  SELECT * INTO v_job
  FROM jobs
  WHERE id = p_job_id
    AND status IN ('done', 'completed', 'failed');
  
  IF NOT FOUND THEN
    RAISE NOTICE 'Job % not found or not completed', p_job_id;
    RETURN NULL;
  END IF;
  
  -- Criar execution retroativa
  INSERT INTO job_executions (
    job_id,
    agent_id,
    tenant_id,
    agent_name,
    agent_version,
    payload_hash,
    status,
    legacy,
    claimed_at,
    started_at,
    finished_at,
    error_message
  )
  VALUES (
    v_job.id,
    v_job.agent_id,
    v_job.tenant_id,
    COALESCE(v_job.agent_name, 'legacy-agent'),
    'pre-execution-model',
    COALESCE(v_job.payload_hash, 'legacy-no-hash'),
    CASE v_job.status 
      WHEN 'done' THEN 'completed'
      ELSE v_job.status 
    END,
    true,
    v_job.created_at,
    COALESCE(v_job.started_at, v_job.delivered_at, v_job.created_at),
    COALESCE(v_job.finished_at, v_job.completed_at)
  )
  RETURNING id INTO v_execution_id;
  
  RAISE NOTICE 'Created retroactive execution % for job %', v_execution_id, p_job_id;
  RETURN v_execution_id;
END;
$$;

-- 5. Comentario de documentacao
COMMENT ON FUNCTION public.create_retroactive_execution(UUID) IS 
'Cria uma execution retroativa para jobs v1 que nao tem trilha de auditoria.
Usado para migracao historica, relatorios e auditoria.
NUNCA usar no fluxo normal de jobs - apenas para compatibilidade.';