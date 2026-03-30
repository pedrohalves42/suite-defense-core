-- COST-OPT NUCLEAR: Remove ALL cron jobs that call edge functions via net.http_post
-- Keep ONLY lightweight SQL-only jobs

DO $$
DECLARE
  jobs_to_kill TEXT[] := ARRAY[
    -- Edge function HTTP callers (EXPENSIVE)
    'ai-system-analyzer-every-6h',
    'analyze-confidence-gap-daily',
    'analyze-job-failure-patterns-daily',
    'calculate-behavioral-baselines-every-6h',
    'calculate-risk-score-daily',
    'check-action-effectiveness-hourly',
    'check-tenant-quotas-hourly',
    'cleanup-expired-enrollment-keys',
    'compute-compliance-benchmarks-daily',
    'evaluate-software-risk-all-agents-daily',
    'generate-scheduled-reports-daily',
    'generate-weekly-security-report',
    'maintenance-cron-every-30min',
    'process-agent-updates',
    'process-dlq-retries-hourly',
    'process-playbook-trigger-logs-hourly',
    'process-report-notifications',
    'process-tenant-suspensions-daily',
    'rls-automated-tests-6h',
    'seed-collection-jobs-every-3h',
    'sync-cve-database-daily',
    'verify-log-integrity-daily',
    'weekly-vulnerability-scan',
    -- Previously targeted but may still exist
    'flush-event-buffer-every-120s',
    'flush-event-buffer-every-60s',
    'flush-event-buffer',
    'scheduled-compliance-refresh-6h',
    'alert-high-failure-rate-2h',
    'check-expiring-enrollment-keys-12h',
    'check-pending-agents-6h',
    'cron-sentinel-6h',
    'monitor-dlq-exhaustion-6h',
    'cleanup-stale-reports-daily',
    'detect-stuck-installations-6h',
    'auto-execute-ai-actions-6h',
    'evaluate-automation-rules-6h',
    'security-alert-dispatcher-6h',
    'monitor-thresholds-6h',
    'process-scheduled-jobs-2h',
    'auto-cleanup-stale-operations',
    'system-maintenance-daily',
    -- Frequent SQL jobs that are too aggressive
    'check-incident-slo-tasks',
    'check-offline-agents-for-playbook',
    'expire-pending-approval-requests',
    'generate-ai-actions-every-30min',
    'cleanup-event-buffer',
    'refresh-incident-slos-hourly',
    'sync-pgcron-health-hourly'
  ];
  jn TEXT;
BEGIN
  FOREACH jn IN ARRAY jobs_to_kill
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = jn) THEN
      PERFORM cron.unschedule(jn);
      RAISE NOTICE 'Unscheduled: %', jn;
    END IF;
  END LOOP;
END $$;

-- KEEP only these essential lightweight SQL-only jobs:
-- 1. daily-cleanup-sql (already exists)
-- 2. refresh-dashboard-matviews (already exists)
-- 3. aggregate-daily-metrics (already exists, runs 1x/day)
-- 4. auto-mark-agents-offline (runs every 15min, SQL only - reduce to hourly)
-- 5. create-metrics-partitions-monthly (1x/month)
-- 6. reset-monthly-quotas (1x/month)
-- 7. alert-long-offline-agents (SQL only, reduce to daily)
-- 8. auto-acknowledge-old-insights (SQL only, 1x/day)
-- 9. poe-key-expiration-sentinel (SQL only, reduce to daily)
-- 10. cleanup-edge-metrics-weekly (SQL only, 1x/week)

-- Reduce auto-mark-agents-offline from every 15min to every 1h
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-mark-agents-offline') THEN
    PERFORM cron.unschedule('auto-mark-agents-offline');
  END IF;
END $$;

SELECT cron.schedule(
  'auto-mark-agents-offline',
  '0 * * * *',
  $$SELECT public.auto_mark_agents_inactive()$$
);

-- Reduce alert-long-offline-agents from every 6h to daily
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alert-long-offline-agents') THEN
    PERFORM cron.unschedule('alert-long-offline-agents');
  END IF;
END $$;

SELECT cron.schedule(
  'alert-long-offline-agents',
  '0 6 * * *',
  $$SELECT public.alert_long_offline_agents()$$
);

-- Reduce poe-key-expiration-sentinel from every 6h to daily
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'poe-key-expiration-sentinel') THEN
    PERFORM cron.unschedule('poe-key-expiration-sentinel');
  END IF;
END $$;

SELECT cron.schedule(
  'poe-key-expiration-sentinel',
  '0 2 * * *',
  $$DO $inner$
DECLARE
  v_expired_count BIGINT;
  v_affected UUID[];
BEGIN
  SELECT expired_count, agents_affected
  INTO v_expired_count, v_affected
  FROM check_expired_agent_keys();
  IF v_expired_count > 0 THEN
    RAISE WARNING '[POE-SENTINEL] EXPIRED KEYS DETECTED: count=%, agents=%',
      v_expired_count, v_affected;
  END IF;
END;
$inner$;$$
);