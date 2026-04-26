-- =====================================================
-- CHAOS TEST RESULTS TABLE
-- Stores immutable history of chaos test executions
-- =====================================================

CREATE TABLE IF NOT EXISTS public.chaos_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_tests INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  global_result TEXT NOT NULL CHECK (global_result IN ('ALL_PASS', 'SOME_FAILED', 'CRITICAL_FAILURE')),
  report JSONB NOT NULL,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chaos_test_results ENABLE ROW LEVEL SECURITY;

-- Policy: Only super_admins can view chaos test results
CREATE POLICY "Super admins can view chaos test results"
  ON public.chaos_test_results
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_chaos_test_results_executed_at 
  ON public.chaos_test_results(executed_at DESC);

-- =====================================================
-- MIGRATE VIEWS TO SECURITY_INVOKER
-- =====================================================

-- 1. Recreate v_integrity_score with security_invoker
DROP VIEW IF EXISTS public.v_integrity_score CASCADE;

CREATE VIEW public.v_integrity_score
WITH (security_invoker = on)
AS
WITH supply_chain_stats AS (
  SELECT 
    count(*) FILTER (WHERE is_active = true) AS active_releases,
    count(*) FILTER (WHERE is_active = true 
      AND sha256 IS NOT NULL 
      AND length(sha256) = 64
      AND CASE 
        WHEN platform = 'windows' THEN length(script_content) >= 50000
        ELSE length(script_content) >= 30000
      END) AS valid_active_releases,
    count(*) AS total_releases,
    count(*) FILTER (WHERE is_active = false) AS archived_releases
  FROM agent_releases
),
job_integrity_stats AS (
  SELECT 
    count(*) AS total_jobs,
    count(*) FILTER (WHERE status = 'completed' 
      AND output IS NOT NULL 
      AND output::text <> '{}' 
      AND output::text <> 'null') AS valid_completed_jobs,
    count(*) FILTER (WHERE status = 'completed') AS completed_jobs,
    count(*) FILTER (WHERE status = 'completed' 
      AND (output IS NULL OR output::text = '{}' OR output::text = 'null')) AS completed_without_output
  FROM jobs
  WHERE created_at > now() - interval '7 days'
),
failed_job_stats AS (
  SELECT 
    count(*) AS failed_jobs,
    count(*) FILTER (WHERE error_message IS NOT NULL AND error_message <> '') AS failed_with_error
  FROM jobs
  WHERE status = 'failed' AND created_at > now() - interval '7 days'
)
SELECT
  CASE WHEN sc.active_releases = 0 THEN 100.0
       ELSE round((sc.valid_active_releases::numeric / sc.active_releases::numeric) * 100, 1)
  END AS supply_chain_score,
  CASE WHEN ji.completed_jobs = 0 THEN 100.0
       ELSE round((ji.valid_completed_jobs::numeric / ji.completed_jobs::numeric) * 100, 1)
  END AS job_integrity_score,
  CASE WHEN fj.failed_jobs = 0 THEN 100.0
       ELSE round((fj.failed_with_error::numeric / fj.failed_jobs::numeric) * 100, 1)
  END AS failed_jobs_score,
  round((
    (CASE WHEN sc.active_releases = 0 THEN 100.0
          ELSE (sc.valid_active_releases::numeric / sc.active_releases::numeric) * 100
     END +
     CASE WHEN ji.completed_jobs = 0 THEN 100.0
          ELSE (ji.valid_completed_jobs::numeric / ji.completed_jobs::numeric) * 100
     END +
     CASE WHEN fj.failed_jobs = 0 THEN 100.0
          ELSE (fj.failed_with_error::numeric / fj.failed_jobs::numeric) * 100
     END) / 3
  ), 1) AS global_integrity_score,
  sc.active_releases,
  sc.valid_active_releases,
  sc.archived_releases,
  sc.total_releases,
  ji.total_jobs,
  ji.completed_jobs,
  ji.valid_completed_jobs,
  ji.completed_without_output,
  fj.failed_jobs,
  fj.failed_with_error,
  now() AS calculated_at
FROM supply_chain_stats sc
CROSS JOIN job_integrity_stats ji
CROSS JOIN failed_job_stats fj;

-- 2. Recreate job_integrity_violations with security_invoker
DROP VIEW IF EXISTS public.job_integrity_violations CASCADE;

CREATE VIEW public.job_integrity_violations
WITH (security_invoker = on)
AS
SELECT 
  j.id AS job_id,
  j.type,
  j.agent_id,
  j.created_at,
  j.tenant_id,
  'MISSING_SIDE_EFFECT'::text AS violation_type,
  'Job completed without generating expected data'::text AS violation_description
FROM jobs j
WHERE j.status = 'completed' 
  AND j.type = 'collect_web_activity'
  AND NOT EXISTS (
    SELECT 1 FROM agent_web_activity aw
    WHERE aw.agent_id = j.agent_id AND aw.created_at >= j.created_at - interval '2 seconds'
  )
UNION ALL
SELECT 
  j.id AS job_id,
  j.type,
  j.agent_id,
  j.created_at,
  j.tenant_id,
  'MISSING_SIDE_EFFECT'::text AS violation_type,
  'Job completed without generating expected data'::text AS violation_description
FROM jobs j
WHERE j.status = 'completed' 
  AND j.type = 'collect_system_metrics'
  AND NOT EXISTS (
    SELECT 1 FROM agent_system_metrics asm
    WHERE asm.agent_id = j.agent_id AND asm.created_at >= j.created_at - interval '2 seconds'
  )
UNION ALL
SELECT 
  j.id AS job_id,
  j.type,
  j.agent_id,
  j.created_at,
  j.tenant_id,
  'MISSING_SIDE_EFFECT'::text AS violation_type,
  'Job completed without generating expected data'::text AS violation_description
FROM jobs j
WHERE j.status = 'completed' 
  AND j.type = 'software_inventory_collect'
  AND NOT EXISTS (
    SELECT 1 FROM software_inventory si
    WHERE si.agent_id = j.agent_id AND si.first_seen_at >= j.created_at - interval '2 seconds'
  )
UNION ALL
SELECT 
  j.id AS job_id,
  j.type,
  j.agent_id,
  j.created_at,
  j.tenant_id,
  'MISSING_ERROR_MESSAGE'::text AS violation_type,
  'Job failed without explanation'::text AS violation_description
FROM jobs j
WHERE j.status = 'failed' 
  AND (j.error_message IS NULL OR trim(j.error_message) = '');