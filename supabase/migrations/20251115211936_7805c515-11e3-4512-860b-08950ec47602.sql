-- FASE 4: View para identificar jobs problemáticos e função de cleanup

-- View para identificar jobs com problemas
CREATE OR REPLACE VIEW public.v_problematic_jobs AS
SELECT 
  j.id,
  j.agent_name,
  j.type,
  j.status,
  j.created_at,
  j.delivered_at,
  j.completed_at,
  CASE 
    WHEN j.status = 'delivered' 
         AND j.delivered_at < NOW() - INTERVAL '10 minutes' 
    THEN 'stuck_delivered'
    
    WHEN j.status = 'queued' 
         AND j.created_at < NOW() - INTERVAL '1 hour' 
    THEN 'stuck_queued'
    
    WHEN j.payload IS NULL 
    THEN 'null_payload'
    
    WHEN j.type IS NULL OR j.type = '' 
    THEN 'invalid_type'
    
    ELSE 'unknown'
  END as problem_type,
  
  EXTRACT(EPOCH FROM (NOW() - j.created_at))/60 as age_minutes
FROM public.jobs j
WHERE 
  -- Jobs delivered há mais de 10min
  (j.status = 'delivered' AND j.delivered_at < NOW() - INTERVAL '10 minutes')
  OR
  -- Jobs queued há mais de 1h
  (j.status = 'queued' AND j.created_at < NOW() - INTERVAL '1 hour')
  OR
  -- Jobs com problemas de dados
  (j.payload IS NULL OR j.type IS NULL OR j.type = '')
ORDER BY j.created_at DESC;

-- Função para deletar jobs problemáticos antigos
CREATE OR REPLACE FUNCTION public.cleanup_old_problematic_jobs(
  p_days_old INTEGER DEFAULT 7
)
RETURNS TABLE(deleted_count INTEGER, job_ids UUID[]) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;