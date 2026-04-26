-- ============================================================
-- KILL SWITCH & ALERT INFRASTRUCTURE (ADR-FINAL)
-- ============================================================

-- Drop existing views to recreate with new columns
DROP VIEW IF EXISTS public.v_security_invariants CASCADE;
DROP VIEW IF EXISTS public.v_cron_silent_failures CASCADE;

-- 1. Create assert_system_allows_jobs function
CREATE OR REPLACE FUNCTION public.assert_system_allows_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode system_operational_mode;
BEGIN
  SELECT mode INTO v_mode FROM system_state WHERE id = 1;
  
  IF v_mode = 'halt_jobs' THEN
    RAISE EXCEPTION 'SYSTEM_HALTED: Jobs execution disabled by kill switch. Set system_state.mode to normal to resume.';
  END IF;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.assert_system_allows_jobs() TO service_role;

-- 2. Create v_cron_silent_failures view for monitoring
CREATE OR REPLACE VIEW public.v_cron_silent_failures
WITH (security_invoker = true)
AS
SELECT
  sj.id,
  sj.name AS job_name,
  sj.job_type,
  sj.cron_expr,
  sj.last_run_at,
  sj.tenant_id,
  MAX(sjr.ran_at) AS last_successful_run,
  NOW() - COALESCE(MAX(sjr.ran_at), sj.created_at) AS silence_duration,
  CASE 
    WHEN MAX(sjr.ran_at) IS NULL THEN 'NEVER_RAN'
    WHEN MAX(sjr.ran_at) < NOW() - INTERVAL '2 hours' THEN 'STALE'
    ELSE 'OK'
  END AS health_status
FROM scheduled_jobs sj
LEFT JOIN scheduled_job_runs sjr ON sjr.job_key = sj.name
WHERE sj.enabled = true
GROUP BY sj.id, sj.name, sj.job_type, sj.cron_expr, sj.last_run_at, sj.tenant_id, sj.created_at
HAVING MAX(sjr.ran_at) IS NULL 
   OR MAX(sjr.ran_at) < NOW() - INTERVAL '2 hours';

-- Grant access
GRANT SELECT ON public.v_cron_silent_failures TO authenticated, service_role;

-- 3. Insert runbook for cron silent failure
INSERT INTO public.runbooks (id, anomaly_type, title, steps, severity, sla_minutes)
VALUES (
  gen_random_uuid(),
  'cron_silent_failure',
  'INC-CRON-001: Cron Jobs Silent Failure',
  '[
    "1. Verificar system_state.mode (halt_jobs?)",
    "2. Verificar INTERNAL_FUNCTION_SECRET configurado",
    "3. Validar invoke-scheduled-jobs passa headers",
    "4. Executar job manualmente: supabase functions invoke <function>",
    "5. Verificar logs de edge functions",
    "6. Se falha persiste >15min, escalar para P0"
  ]'::jsonb,
  'critical',
  15
)
ON CONFLICT (anomaly_type) DO UPDATE SET
  title = EXCLUDED.title,
  steps = EXCLUDED.steps,
  severity = EXCLUDED.severity,
  sla_minutes = EXCLUDED.sla_minutes,
  updated_at = NOW();

-- 4. Create v_security_invariants with kill switch and cron health checks
CREATE OR REPLACE VIEW public.v_security_invariants
WITH (security_invoker = true)
AS
-- Check for dangerous public write policies
SELECT
  'PUBLIC_WRITE_POLICIES' AS invariant,
  COUNT(*) AS violations,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'CRITICAL' END AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  AND qual = 'true'

UNION ALL

-- Check for DLQ jobs (should be investigated)
SELECT
  'DLQ_CRITICAL_JOBS' AS invariant,
  COUNT(*) AS violations,
  CASE 
    WHEN COUNT(*) = 0 THEN 'OK'
    WHEN COUNT(*) <= 20 THEN 'LOW'
    ELSE 'HIGH'
  END AS status
FROM failed_jobs_dlq

UNION ALL

-- Check for scheduled jobs without recent runs (stale)
SELECT
  'SCHEDULED_JOBS_NO_RUNS' AS invariant,
  COUNT(*) AS violations,
  CASE 
    WHEN COUNT(*) = 0 THEN 'OK'
    WHEN COUNT(*) <= 5 THEN 'LOW'
    ELSE 'CRITICAL'
  END AS status
FROM scheduled_jobs sj
WHERE sj.enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM scheduled_job_runs sjr
    WHERE sjr.job_key = sj.name
      AND sjr.ran_at > NOW() - INTERVAL '4 hours'
  )

UNION ALL

-- Check kill switch function exists
SELECT
  'KILL_SWITCH_FUNCTIONAL' AS invariant,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assert_system_allows_jobs')
    THEN 0 
    ELSE 1 
  END AS violations,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assert_system_allows_jobs')
    THEN 'OK' 
    ELSE 'CRITICAL' 
  END AS status

UNION ALL

-- Check cron jobs health
SELECT
  'CRON_JOBS_HEALTHY' AS invariant,
  COUNT(*) AS violations,
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'HIGH' END AS status
FROM public.v_cron_silent_failures
WHERE health_status != 'OK';

-- Grant access
GRANT SELECT ON public.v_security_invariants TO authenticated, service_role;

-- 5. Create function for kill switch check from edge functions
CREATE OR REPLACE FUNCTION public.get_system_mode_safe()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode system_operational_mode;
BEGIN
  SELECT mode INTO v_mode FROM system_state WHERE id = 1;
  RETURN v_mode::text;
EXCEPTION WHEN OTHERS THEN
  -- Fail-closed: if we can't check, assume halt
  RETURN 'halt_jobs';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_mode_safe() TO service_role;