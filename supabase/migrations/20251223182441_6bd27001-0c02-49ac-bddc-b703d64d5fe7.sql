-- Cleanup stuck jobs (queued/delivered ha mais de 2 horas)
-- One-time cleanup
UPDATE public.jobs
SET 
  status = 'failed',
  error_message = 'Auto-cleanup: job stuck for over 2 hours',
  completed_at = NOW()
WHERE 
  (status = 'queued' AND created_at < NOW() - INTERVAL '2 hours')
  OR (status = 'delivered' AND delivered_at < NOW() - INTERVAL '2 hours');

-- Create or replace improved cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_stuck_jobs_v2(
  p_queued_timeout_hours INTEGER DEFAULT 2,
  p_delivered_timeout_hours INTEGER DEFAULT 2
)
RETURNS TABLE(
  cleaned_queued INTEGER,
  cleaned_delivered INTEGER,
  job_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_queued_count INTEGER := 0;
  v_delivered_count INTEGER := 0;
  v_all_ids UUID[];
BEGIN
  -- Cleanup queued jobs stuck for too long
  WITH updated_queued AS (
    UPDATE jobs
    SET 
      status = 'failed',
      error_message = 'Auto-cleanup: queued job exceeded ' || p_queued_timeout_hours || ' hours timeout',
      completed_at = NOW()
    WHERE status = 'queued'
      AND created_at < NOW() - (p_queued_timeout_hours || ' hours')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER, ARRAY_AGG(id)
  INTO v_queued_count, v_all_ids
  FROM updated_queued;
  
  -- Cleanup delivered jobs stuck for too long
  WITH updated_delivered AS (
    UPDATE jobs
    SET 
      status = 'failed',
      error_message = 'Auto-cleanup: delivered job exceeded ' || p_delivered_timeout_hours || ' hours timeout',
      completed_at = NOW()
    WHERE status = 'delivered'
      AND delivered_at < NOW() - (p_delivered_timeout_hours || ' hours')::INTERVAL
    RETURNING id
  )
  SELECT 
    COUNT(*)::INTEGER, 
    COALESCE(v_all_ids, ARRAY[]::UUID[]) || COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[])
  INTO v_delivered_count, v_all_ids
  FROM updated_delivered;
  
  -- Log if any jobs were cleaned
  IF v_queued_count > 0 OR v_delivered_count > 0 THEN
    RAISE NOTICE 'Cleanup completed: % queued and % delivered jobs marked as failed', 
      v_queued_count, v_delivered_count;
  END IF;
  
  RETURN QUERY SELECT 
    v_queued_count,
    v_delivered_count,
    COALESCE(v_all_ids, ARRAY[]::UUID[]);
END;
$$;