-- ============================================================
-- MIGRACAO CONSOLIDADA: Fechamento de Todos os GAPs
-- Data: 2026-02-01
-- Autor: Sistema
-- ============================================================

-- ============================================================
-- PARTE 1: Corrigir Trigger de Protecao de Execucoes
-- Permite delecao de registros antigos (> 90 dias) para cleanup
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_execution_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Permitir delecao de registros antigos (> 90 dias) para cleanup
  IF OLD.created_at < NOW() - INTERVAL '90 days' THEN
    RETURN OLD;
  END IF;
  
  -- Bloquear delecao de registros recentes
  RAISE EXCEPTION 'Cannot delete job execution records within 90 days retention period'
    USING ERRCODE = '23514';
END;
$$;

-- ============================================================
-- PARTE 2: Habilitar RLS nas Particoes HMAC
-- ============================================================

DO $$
DECLARE
  partition_name TEXT;
  partitions TEXT[] := ARRAY[
    'hmac_signatures_2026_02',
    'hmac_signatures_2026_03',
    'hmac_signatures_2026_04',
    'hmac_signatures_2026_05',
    'hmac_signatures_2026_06'
  ];
BEGIN
  FOREACH partition_name IN ARRAY partitions
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
      EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON %I', partition_name);
      EXECUTE format(
        'CREATE POLICY "service_role_all" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        partition_name
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Particao % nao existe, pulando...', partition_name;
    END;
  END LOOP;
END $$;

-- ============================================================
-- PARTE 3: RPCs de Limpeza
-- ============================================================

-- RPC: Processar DLQ em lote
CREATE OR REPLACE FUNCTION process_dlq_batch(
  p_tenant_id UUID,
  p_batch_size INTEGER DEFAULT 50,
  p_action TEXT DEFAULT 'resolve'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_retried INTEGER := 0;
  v_resolved INTEGER := 0;
  v_item RECORD;
BEGIN
  FOR v_item IN
    SELECT d.id, d.job_id, d.retry_count
    FROM failed_jobs_dlq d
    JOIN jobs j ON j.id = d.job_id
    WHERE j.tenant_id = p_tenant_id
      AND d.resolved_at IS NULL
    ORDER BY d.failed_at ASC
    LIMIT p_batch_size
  LOOP
    v_processed := v_processed + 1;
    
    IF p_action = 'retry' AND v_item.retry_count < 3 THEN
      UPDATE jobs 
      SET status = 'queued', updated_at = NOW()
      WHERE id = v_item.job_id;
      
      UPDATE failed_jobs_dlq 
      SET retry_count = retry_count + 1, last_retry_at = NOW()
      WHERE id = v_item.id;
      
      v_retried := v_retried + 1;
    ELSE
      UPDATE failed_jobs_dlq 
      SET resolved_at = NOW(), resolution_notes = 'Resolved via batch cleanup'
      WHERE id = v_item.id;
      
      v_resolved := v_resolved + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'processed', v_processed,
    'retried', v_retried,
    'resolved', v_resolved,
    'tenant_id', p_tenant_id
  );
END;
$$;

-- RPC: Limpar tasks orfas
CREATE OR REPLACE FUNCTION cleanup_stale_tasks(
  p_tenant_id UUID,
  p_days_old INTEGER DEFAULT 30,
  p_batch_size INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_cancelled INTEGER := 0;
  v_archived INTEGER := 0;
BEGIN
  WITH orphan_tasks AS (
    SELECT id FROM tasks
    WHERE tenant_id = p_tenant_id
      AND status = 'open'
      AND fingerprint_id IS NULL
      AND created_at < NOW() - (p_days_old || ' days')::INTERVAL
    LIMIT p_batch_size
  )
  UPDATE tasks t
  SET status = 'cancelled',
      closed_at = NOW(),
      resolution_notes = 'Auto-cancelled: orphan task without fingerprint'
  FROM orphan_tasks o
  WHERE t.id = o.id;
  
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  
  WITH old_resolved AS (
    SELECT id FROM tasks
    WHERE tenant_id = p_tenant_id
      AND status IN ('resolved', 'cancelled', 'wont_fix')
      AND closed_at < NOW() - INTERVAL '90 days'
      AND archived_at IS NULL
    LIMIT p_batch_size
  )
  UPDATE tasks t
  SET archived_at = NOW()
  FROM old_resolved o
  WHERE t.id = o.id;
  
  GET DIAGNOSTICS v_archived = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'cancelled_orphans', v_cancelled,
    'archived_old', v_archived,
    'tenant_id', p_tenant_id
  );
END;
$$;

-- ============================================================
-- PARTE 4: Criar Particao HMAC para Julho 2026 (Prevencao)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'hmac_signatures_2026_07'
  ) THEN
    CREATE TABLE hmac_signatures_2026_07 
    PARTITION OF hmac_signatures
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
    
    ALTER TABLE hmac_signatures_2026_07 ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "service_role_all" ON hmac_signatures_2026_07
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;