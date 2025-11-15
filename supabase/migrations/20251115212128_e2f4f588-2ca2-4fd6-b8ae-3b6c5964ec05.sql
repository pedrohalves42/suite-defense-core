-- Correção de segurança: Adicionar search_path à função cleanup_old_problematic_jobs
CREATE OR REPLACE FUNCTION public.cleanup_old_problematic_jobs(
  p_days_old INTEGER DEFAULT 7
)
RETURNS TABLE(deleted_count INTEGER, job_ids UUID[]) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff_date TIMESTAMP;
  v_deleted_ids UUID[];
  v_count INTEGER;
BEGIN
  v_cutoff_date := NOW() - (p_days_old || ' days')::INTERVAL;
  
  -- Deletar jobs problemáticos antigos
  WITH deleted AS (
    DELETE FROM public.jobs
    WHERE id IN (
      SELECT id FROM public.v_problematic_jobs
      WHERE created_at < v_cutoff_date
    )
    RETURNING id
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(id)
  INTO v_count, v_deleted_ids
  FROM deleted;
  
  RETURN QUERY SELECT v_count, v_deleted_ids;
END;
$$;