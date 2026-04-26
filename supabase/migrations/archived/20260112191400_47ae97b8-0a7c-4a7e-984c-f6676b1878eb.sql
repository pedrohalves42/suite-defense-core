-- FASE 9: Corrigir v_cron_silent_failures para usar job_key corretamente
-- Problema: scheduled_jobs.name ("AI System Analyzer") != scheduled_job_runs.job_key ("ai-system-analyzer")

-- Primeiro: Atualizar job_key nos scheduled_jobs (a coluna ja existe pela migracao anterior que parcialmente executou)
-- Se a coluna nao existir, adiciona-la
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'scheduled_jobs' AND column_name = 'job_key') THEN
    ALTER TABLE scheduled_jobs ADD COLUMN job_key TEXT;
  END IF;
END $$;

-- Atualizar job_key baseado no mapeamento conhecido
UPDATE scheduled_jobs SET job_key = 'ai-system-analyzer' WHERE name = 'AI System Analyzer' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'auto-cleanup-jobs' WHERE name = 'Auto Cleanup Jobs' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'auto-execute-ai-actions' WHERE name = 'Auto Execute AI Actions' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'autonomous-safe-mode' WHERE name = 'Autonomous SAFE_MODE' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'detect-blocked-attempts' WHERE name = 'Detect Blocked Attempts' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'generate-executive-report' WHERE name = 'Executive Report' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'integrity-sentinel' WHERE name = 'Integrity Sentinel' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'scheduled-report-generator' WHERE name = 'Scheduled Report Generator' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'watchdog-non-execution' WHERE name = 'Watchdog Non-Execution' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'ai-get-insights' WHERE name = 'AI Insight Generator' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'ai-full-audit' WHERE name = 'AI Full Audit Weekly' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'ai-red-team-assessment' WHERE name = 'AI Red Team Assessment' AND (job_key IS NULL OR job_key = '');
UPDATE scheduled_jobs SET job_key = 'generate-weekly-report' WHERE name = 'Weekly Security Report' AND (job_key IS NULL OR job_key = '');

-- Criar indice para performance
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_job_key ON scheduled_jobs(job_key);

-- DROP CASCADE para remover views dependentes
DROP VIEW IF EXISTS v_security_invariants CASCADE;
DROP VIEW IF EXISTS v_cron_silent_failures CASCADE;

-- Recriar v_cron_silent_failures usando job_key corretamente
CREATE OR REPLACE VIEW v_cron_silent_failures AS
SELECT 
  sj.id,
  sj.name AS job_name,
  sj.job_type,
  sj.job_key,
  sj.cron_expr,
  sj.last_run_at,
  sj.tenant_id,
  MAX(sjr.ran_at) AS last_successful_run,
  NOW() - COALESCE(MAX(sjr.ran_at), sj.created_at) AS silence_duration,
  CASE
    WHEN MAX(sjr.ran_at) IS NULL THEN 'NEVER_RAN'::text
    WHEN MAX(sjr.ran_at) < (NOW() - INTERVAL '2 hours') THEN 'STALE'::text
    ELSE 'OK'::text
  END AS health_status
FROM scheduled_jobs sj
LEFT JOIN scheduled_job_runs sjr ON sjr.job_key = sj.job_key AND sjr.success = true
WHERE sj.enabled = true
GROUP BY sj.id, sj.name, sj.job_type, sj.job_key, sj.cron_expr, sj.last_run_at, sj.tenant_id, sj.created_at;

-- Recriar v_security_invariants usando job_key corretamente
CREATE OR REPLACE VIEW v_security_invariants AS
-- PUBLIC_WRITE_POLICIES
SELECT 
  'PUBLIC_WRITE_POLICIES'::text AS invariant,
  COUNT(*) AS violations,
  CASE WHEN COUNT(*) = 0 THEN 'OK'::text ELSE 'CRITICAL'::text END AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND roles::text ~~ '%public%'
  AND (
    (cmd = ANY (ARRAY['UPDATE', 'DELETE', 'ALL']) AND (qual = 'true' OR qual IS NULL))
    OR (cmd = 'INSERT' AND (with_check = 'true' OR with_check IS NULL))
  )
  AND COALESCE(with_check, '') <> 'false'
  AND COALESCE(qual, '') <> 'false'

UNION ALL

-- SCHEDULED_JOBS_NO_RUNS (Agora usando job_key corretamente)
SELECT 
  'SCHEDULED_JOBS_NO_RUNS'::text AS invariant,
  COUNT(*) AS violations,
  CASE WHEN COUNT(*) = 0 THEN 'OK'::text ELSE 'CRITICAL'::text END AS status
FROM scheduled_jobs sj
WHERE sj.enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM scheduled_job_runs sjr 
    WHERE sjr.job_key = sj.job_key 
    AND sjr.ran_at > (NOW() - INTERVAL '24 hours')
    AND sjr.success = true
  )

UNION ALL

-- DLQ_CRITICAL_JOBS
SELECT 
  'DLQ_CRITICAL_JOBS'::text AS invariant,
  COUNT(*) AS violations,
  CASE WHEN COUNT(*) <= 100 THEN 'OK'::text ELSE 'HIGH'::text END AS status
FROM scheduled_job_runs
WHERE success = false AND ran_at > (NOW() - INTERVAL '24 hours')

UNION ALL

-- KILL_SWITCH_FUNCTIONAL
SELECT 
  'KILL_SWITCH_FUNCTIONAL'::text AS invariant,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assert_system_allows_jobs') THEN 0 ELSE 1 END AS violations,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assert_system_allows_jobs') THEN 'OK'::text ELSE 'CRITICAL'::text END AS status

UNION ALL

-- CRON_JOBS_HEALTHY (baseado na view corrigida)
SELECT 
  'CRON_JOBS_HEALTHY'::text AS invariant,
  COUNT(*) AS violations,
  CASE WHEN COUNT(*) = 0 THEN 'OK'::text ELSE 'HIGH'::text END AS status
FROM v_cron_silent_failures
WHERE health_status <> 'OK';

-- Conceder permissoes
GRANT SELECT ON v_cron_silent_failures TO authenticated, service_role;
GRANT SELECT ON v_security_invariants TO authenticated, service_role;

-- Comentarios
COMMENT ON VIEW v_cron_silent_failures IS 'View para detectar jobs agendados que nao estao executando com sucesso. Usa job_key para correlacionar com scheduled_job_runs.';
COMMENT ON COLUMN scheduled_jobs.job_key IS 'Chave de identificacao do job usada em scheduled_job_runs para correlacao de execucoes';