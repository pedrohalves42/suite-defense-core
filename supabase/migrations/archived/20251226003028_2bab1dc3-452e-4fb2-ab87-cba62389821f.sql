-- ============================================================================
-- ARCH-NULL-ROOT: Prevencao de Violacoes de Invariantes
-- ============================================================================

-- FASE 2.1: Trigger para sincronizar executions quando job e finalizado
CREATE OR REPLACE FUNCTION public.sync_execution_on_job_finalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Se job esta sendo finalizado (transicao para estado terminal)
  IF OLD.status NOT IN ('completed', 'failed', 'cancelled', 'done')
     AND NEW.status IN ('completed', 'failed', 'cancelled', 'done') THEN
    
    -- Finalizar qualquer execution orfa em 'claimed'
    UPDATE job_executions
    SET 
      status = NEW.status,
      finished_at = COALESCE(finished_at, NOW()),
      error_message = CASE 
        WHEN NEW.status = 'failed' THEN COALESCE(error_message, NEW.error_message, 'Auto-synced on job finalization')
        ELSE error_message
      END
    WHERE job_id = NEW.id
      AND status = 'claimed';
    
    -- Garantir que current_execution_id seja limpo (P2.1 enforcement)
    NEW.current_execution_id := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger apenas se nao existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_execution_on_finalize'
  ) THEN
    CREATE TRIGGER trg_sync_execution_on_finalize
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION sync_execution_on_job_finalize();
  END IF;
END;
$$;

-- FASE 2.2: Tornar payload_hash NOT NULL (dados ja corrigidos)
ALTER TABLE jobs ALTER COLUMN payload_hash SET NOT NULL;

-- FASE 3.1: Funcao sentinel para detectar violacoes futuras
CREATE OR REPLACE FUNCTION public.check_execution_orphans()
RETURNS TABLE(
  orphan_count BIGINT, 
  residual_execution_id_count BIGINT,
  null_payload_hash_count BIGINT,
  affected_job_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH orphan_executions AS (
    SELECT DISTINCT je.job_id
    FROM job_executions je
    JOIN jobs j ON je.job_id = j.id
    WHERE j.status IN ('completed', 'failed', 'cancelled', 'done')
      AND je.status = 'claimed'
  ),
  residual_ids AS (
    SELECT id
    FROM jobs
    WHERE status IN ('completed', 'failed', 'cancelled', 'done')
      AND current_execution_id IS NOT NULL
  ),
  null_hashes AS (
    SELECT id
    FROM jobs
    WHERE payload_hash IS NULL
  )
  SELECT 
    (SELECT COUNT(*) FROM orphan_executions)::BIGINT,
    (SELECT COUNT(*) FROM residual_ids)::BIGINT,
    (SELECT COUNT(*) FROM null_hashes)::BIGINT,
    (
      SELECT ARRAY_AGG(DISTINCT job_id) 
      FROM (
        SELECT job_id FROM orphan_executions
        UNION
        SELECT id FROM residual_ids
        UNION
        SELECT id FROM null_hashes
      ) combined
    );
END;
$$;

-- FASE 3.2: Adicionar comentario de auditoria
COMMENT ON FUNCTION sync_execution_on_job_finalize() IS 
  'ARCH-NULL-ROOT: Garante sincronizacao automatica de job_executions quando job e finalizado. 
   Previne executions orfas e limpa current_execution_id residual.';

COMMENT ON FUNCTION check_execution_orphans() IS
  'ARCH-NULL-ROOT Sentinel: Detecta violacoes de invariantes (orphan executions, residual execution_id, null payload_hash).
   Deve retornar 0,0,0,NULL em sistema saudavel.';