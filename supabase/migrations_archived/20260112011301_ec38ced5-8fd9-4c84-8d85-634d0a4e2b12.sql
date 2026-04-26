-- Phase 3: Fix PUBLIC_WRITE_POLICIES invariant to exclude blocking policies
DROP VIEW IF EXISTS v_security_invariants;

CREATE OR REPLACE VIEW v_security_invariants AS
-- PUBLIC_WRITE_POLICIES: Verifica policies publicas perigosas (exclui politicas de bloqueio)
SELECT
  'PUBLIC_WRITE_POLICIES' as invariant,
  COUNT(*) as violations,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'CRITICAL' END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND roles::text LIKE '%public%'
  AND (
    (cmd IN ('UPDATE', 'DELETE', 'ALL') AND (qual::text = 'true' OR qual IS NULL))
    OR
    (cmd = 'INSERT' AND (with_check::text = 'true' OR with_check IS NULL))
  )
  -- Exclude explicit blocking policies (with_check = false or qual = false)
  AND COALESCE(with_check::text, '') != 'false'
  AND COALESCE(qual::text, '') != 'false'

UNION ALL

-- SCHEDULED_JOBS_NO_RUNS: Jobs habilitados sem execucao recente
SELECT
  'SCHEDULED_JOBS_NO_RUNS' as invariant,
  COUNT(*) as violations,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'CRITICAL' END as status
FROM scheduled_jobs sj
WHERE sj.enabled = true
AND NOT EXISTS (
  SELECT 1 FROM scheduled_job_runs sjr
  WHERE sjr.job_key = sj.name
  AND sjr.ran_at > NOW() - INTERVAL '24 hours'
)

UNION ALL

-- DLQ_CRITICAL_JOBS: Jobs com falhas nao resolvidas
SELECT
  'DLQ_CRITICAL_JOBS' as invariant,
  COUNT(*) as violations,
  CASE WHEN COUNT(*) <= 100 THEN 'OK' ELSE 'HIGH' END as status
FROM scheduled_job_runs
WHERE success = false
AND ran_at > NOW() - INTERVAL '24 hours'

UNION ALL

-- KILL_SWITCH_FUNCTIONAL: Verifica se funcao existe
SELECT
  'KILL_SWITCH_FUNCTIONAL' as invariant,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assert_system_allows_jobs')
    THEN 0 
    ELSE 1 
  END as violations,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assert_system_allows_jobs')
    THEN 'OK' 
    ELSE 'CRITICAL' 
  END as status

UNION ALL

-- CRON_JOBS_HEALTHY: Verifica jobs silenciosos
SELECT
  'CRON_JOBS_HEALTHY' as invariant,
  COUNT(*) as violations,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'HIGH' END as status
FROM v_cron_silent_failures
WHERE health_status != 'OK';

-- Grant access
GRANT SELECT ON v_security_invariants TO authenticated, service_role;