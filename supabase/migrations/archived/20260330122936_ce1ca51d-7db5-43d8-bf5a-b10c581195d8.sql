-- COST-OPT: Kill ALL expensive cron jobs
-- Use safe approach: only unschedule if exists

DO $$
DECLARE
  job_names TEXT[] := ARRAY[
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
    'system-maintenance-daily'
  ];
  jn TEXT;
BEGIN
  FOREACH jn IN ARRAY job_names
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = jn) THEN
      PERFORM cron.unschedule(jn);
      RAISE NOTICE 'Unscheduled: %', jn;
    END IF;
  END LOOP;
END $$;

-- Keep only 2 lightweight SQL-only cron jobs:

-- 1. Daily cleanup (SQL only, no edge function)
SELECT cron.schedule(
  'daily-cleanup-sql',
  '0 3 * * *',
  $$SELECT public.auto_cleanup_stale_operations()$$
);

-- 2. Matview refresh stays at 6h (already exists as refresh-dashboard-matviews)