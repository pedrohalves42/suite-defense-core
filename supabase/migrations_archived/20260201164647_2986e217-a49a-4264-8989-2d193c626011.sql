-- ============================================================
-- CORRECAO: RPCs de Limpeza com colunas corretas
-- ============================================================

-- RPC: Processar DLQ em lote (corrigido)
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
    SELECT d.id, d.original_job_id, d.retry_count
    FROM failed_jobs_dlq d
    WHERE d.tenant_id = p_tenant_id
      AND d.resolved_at IS NULL
    ORDER BY d.last_failure_at ASC
    LIMIT p_batch_size
  LOOP
    v_processed := v_processed + 1;
    
    IF p_action = 'retry' AND v_item.retry_count < 3 THEN
      UPDATE jobs 
      SET status = 'queued', updated_at = NOW()
      WHERE id = v_item.original_job_id;
      
      UPDATE failed_jobs_dlq 
      SET retry_count = retry_count + 1, next_retry_at = NOW()
      WHERE id = v_item.id;
      
      v_retried := v_retried + 1;
    ELSE
      UPDATE failed_jobs_dlq 
      SET resolved_at = NOW(), 
          resolution_notes = 'Resolved via batch cleanup',
          status = 'resolved'
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

-- RPC: Limpar tasks orfas (corrigido)
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
  -- Cancelar tasks abertas sem fingerprint (orfas)
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
      closure_reason = 'Auto-cancelled: orphan task without fingerprint'
  FROM orphan_tasks o
  WHERE t.id = o.id;
  
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'cancelled_orphans', v_cancelled,
    'tenant_id', p_tenant_id
  );
END;
$$;