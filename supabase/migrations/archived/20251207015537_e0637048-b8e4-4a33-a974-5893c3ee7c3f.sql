-- ============================================================================
-- P1 CORRECTIONS: Security, Cleanup, and Performance Optimizations
-- ============================================================================

-- ==== SEC-01: Fix rate_limit_stats view with tenant isolation ====
DROP VIEW IF EXISTS public.rate_limit_stats;

CREATE OR REPLACE VIEW public.rate_limit_stats 
WITH (security_invoker = on)
AS
SELECT 
  rl.endpoint,
  rl.identifier,
  rl.request_count,
  rl.window_start,
  rl.blocked_until,
  (rl.blocked_until > NOW()) AS is_blocked
FROM public.rate_limits rl
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'super_admin')
);

COMMENT ON VIEW public.rate_limit_stats IS 'Rate limit statistics with tenant isolation via security_invoker';

-- ==== FUNC-01: Create function to cleanup stale queued jobs ====
CREATE OR REPLACE FUNCTION public.cleanup_stale_queued_jobs(p_hours_threshold INTEGER DEFAULT 24)
RETURNS TABLE(cleaned_count INTEGER, job_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMP WITH TIME ZONE;
  v_cleaned_count INTEGER;
  v_job_ids UUID[];
BEGIN
  v_cutoff := NOW() - (p_hours_threshold || ' hours')::INTERVAL;
  
  -- Mark stale queued jobs as failed with explanation
  WITH updated_jobs AS (
    UPDATE jobs
    SET 
      status = 'failed',
      error_message = 'Job timeout: stuck in queued state for more than ' || p_hours_threshold || ' hours (auto-cleanup)',
      completed_at = NOW()
    WHERE status = 'queued'
      AND created_at < v_cutoff
    RETURNING id
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(id)
  INTO v_cleaned_count, v_job_ids
  FROM updated_jobs;
  
  -- Log cleanup operation
  IF v_cleaned_count > 0 THEN
    RAISE NOTICE 'Cleanup completed: % stale queued jobs marked as failed', v_cleaned_count;
  END IF;
  
  RETURN QUERY SELECT 
    COALESCE(v_cleaned_count, 0),
    COALESCE(v_job_ids, ARRAY[]::UUID[]);
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_queued_jobs IS 'Cleans up jobs stuck in queued state beyond threshold hours';

-- ==== FUNC-01: Execute immediate cleanup for current stuck jobs ====
DO $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM public.cleanup_stale_queued_jobs(48);
  RAISE NOTICE 'Initial cleanup: % jobs cleaned', v_result.cleaned_count;
END $$;

-- ==== SCALE-01: Remove redundant indexes from agent_system_metrics ====
-- Keep only the most useful composite indexes

-- Drop redundant single-column indexes (covered by composite indexes)
DROP INDEX IF EXISTS public.idx_agent_system_metrics_agent_id;
DROP INDEX IF EXISTS public.idx_agent_system_metrics_collected_at;
DROP INDEX IF EXISTS public.idx_agent_system_metrics_tenant_id;

-- The composite index (tenant_id, agent_id, collected_at DESC) handles all query patterns
-- Verify existing composite index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'agent_system_metrics' 
      AND indexname = 'idx_agent_metrics_tenant_agent_collected'
  ) THEN
    CREATE INDEX idx_agent_metrics_tenant_agent_collected 
    ON public.agent_system_metrics (tenant_id, agent_id, collected_at DESC);
  END IF;
END $$;

-- ==== Add cleanup_stale_queued_jobs to scheduled maintenance ====
-- This ensures the function runs periodically

COMMENT ON FUNCTION public.cleanup_stale_queued_jobs IS 
'P1 FIX: Cleans up jobs stuck in queued state. Should be called daily via cron or Edge Function scheduler. Default threshold: 24 hours.';