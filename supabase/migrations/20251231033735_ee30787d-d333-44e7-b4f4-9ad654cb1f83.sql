-- ============================================
-- SURGICAL MATURATION - PHASE 2 MIGRATION (FIX)
-- ============================================

-- 1. ADD job_source COLUMN TO scheduled_job_runs
ALTER TABLE public.scheduled_job_runs 
ADD COLUMN IF NOT EXISTS job_source TEXT NOT NULL DEFAULT 'cron' 
CHECK (job_source IN ('cron', 'manual', 'retry', 'system'));

-- 2. RENAME job_name TO job_key (if job_name exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scheduled_job_runs' 
    AND column_name = 'job_name'
  ) THEN
    ALTER TABLE public.scheduled_job_runs RENAME COLUMN job_name TO job_key;
  END IF;
END $$;

-- 3. CREATE INDEX ON job_source
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_source 
  ON public.scheduled_job_runs(job_source);

-- 4. ADD STATUS COLUMNS TO ai_insights
ALTER TABLE public.ai_insights 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open' 
CHECK (status IN ('open', 'in_progress', 'resolved', 'ignored', 'failed'));

ALTER TABLE public.ai_insights 
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE public.ai_insights 
ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id);

-- 5. CREATE INDEX FOR OPEN INSIGHTS (fast filtering)
CREATE INDEX IF NOT EXISTS idx_ai_insights_status_open 
  ON public.ai_insights(status) 
  WHERE status = 'open';

-- 6. UPDATE v_job_health VIEW TO USE job_key AND job_source
DROP VIEW IF EXISTS public.v_job_health;

CREATE VIEW public.v_job_health 
WITH (security_invoker = true) AS
SELECT
  sjr.job_key,
  sjr.job_source,
  MAX(sjr.ran_at) AS last_run,
  MAX(sjr.ran_at) FILTER (WHERE sjr.success = true) AS last_success,
  MAX(sjr.ran_at) FILTER (WHERE sjr.success = false) AS last_failure,
  COUNT(*) FILTER (
    WHERE sjr.success = false 
    AND sjr.ran_at > NOW() - INTERVAL '24 hours'
  ) AS failure_count_24h,
  COUNT(*) FILTER (
    WHERE sjr.success = true 
    AND sjr.ran_at > NOW() - INTERVAL '24 hours'
  ) AS success_count_24h,
  COUNT(*) FILTER (
    WHERE sjr.ran_at > NOW() - INTERVAL '24 hours'
  ) AS total_runs_24h,
  ROUND(AVG(sjr.duration_ms)::numeric, 0) AS avg_duration_ms,
  MAX(sjr.duration_ms) AS max_duration_ms,
  CASE
    WHEN MAX(sjr.ran_at) IS NULL THEN 'never_ran'
    WHEN COUNT(*) FILTER (WHERE sjr.success = false AND sjr.ran_at > NOW() - INTERVAL '24 hours') >= 3 THEN 'critical'
    WHEN COUNT(*) FILTER (WHERE sjr.success = false AND sjr.ran_at > NOW() - INTERVAL '24 hours') >= 1 THEN 'warning'
    WHEN MAX(sjr.ran_at) < NOW() - INTERVAL '2 hours' THEN 'stale'
    ELSE 'healthy'
  END AS health_status,
  CASE
    WHEN COUNT(*) FILTER (WHERE sjr.success = false AND sjr.ran_at > NOW() - INTERVAL '24 hours') >= 3 THEN 'critical'
    WHEN COUNT(*) FILTER (WHERE sjr.success = false AND sjr.ran_at > NOW() - INTERVAL '24 hours') >= 1 THEN 'high'
    WHEN MAX(sjr.ran_at) < NOW() - INTERVAL '2 hours' THEN 'medium'
    ELSE 'low'
  END AS severity
FROM public.scheduled_job_runs sjr
GROUP BY sjr.job_key, sjr.job_source;

-- 7. DROP EXISTING FUNCTION FIRST THEN RECREATE
DROP FUNCTION IF EXISTS public.log_scheduled_job_run;

CREATE FUNCTION public.log_scheduled_job_run(
  p_job_key TEXT,
  p_success BOOLEAN,
  p_duration_ms INTEGER DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_result JSONB DEFAULT NULL,
  p_processed_count INTEGER DEFAULT 0,
  p_job_source TEXT DEFAULT 'cron'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO scheduled_job_runs (
    job_key,
    job_source,
    ran_at,
    success,
    duration_ms,
    error,
    result,
    processed_count
  ) VALUES (
    p_job_key,
    COALESCE(p_job_source, 'cron'),
    NOW(),
    p_success,
    p_duration_ms,
    p_error,
    p_result,
    p_processed_count
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- 8. DROP AND RECREATE get_job_health_summary FUNCTION
DROP FUNCTION IF EXISTS public.get_job_health_summary();

CREATE FUNCTION public.get_job_health_summary()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT json_build_object(
    'total_jobs', COUNT(DISTINCT job_key),
    'healthy_jobs', COUNT(DISTINCT job_key) FILTER (WHERE health_status = 'healthy'),
    'warning_jobs', COUNT(DISTINCT job_key) FILTER (WHERE health_status = 'warning'),
    'critical_jobs', COUNT(DISTINCT job_key) FILTER (WHERE health_status = 'critical'),
    'stale_jobs', COUNT(DISTINCT job_key) FILTER (WHERE health_status = 'stale'),
    'never_ran_jobs', COUNT(DISTINCT job_key) FILTER (WHERE health_status = 'never_ran')
  )
  FROM v_job_health;
$$;