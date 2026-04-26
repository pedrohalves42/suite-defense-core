-- COST-OPT v10: Consolidate monitor/check cron jobs into health-monitor + security-monitor
-- Also consolidate sync cron jobs (release-sync already exists)

DO $$
BEGIN
  -- Remove individual health monitor cron jobs (now handled by health-monitor)
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
    'check-stuck-jobs',
    'check-stuck-jobs-every-15min',
    'check-pending-agents',
    'check-pending-agents-cron',
    'check-installation-health',
    'check-installation-health-cron',
    'monitor-agent-health',
    'monitor-agent-health-cron',
    'monitor-dlq-exhaustion',
    'monitor-dlq-exhaustion-cron',
    'monitor-slow-operations',
    'monitor-slow-operations-cron',
    'monitor-stuck-agents',
    'monitor-stuck-agents-cron',
    'monitor-thresholds',
    'monitor-thresholds-cron',
    'detect-stuck-installations',
    'detect-stuck-installations-cron'
  );

  -- Remove individual security monitor cron jobs (now handled by security-monitor)
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
    'check-credential-rotation',
    'check-credential-rotation-cron',
    'check-credential-rotation-daily',
    'check-expiring-enrollment-keys',
    'check-expiring-enrollment-keys-cron'
  );

  -- Remove individual sync cron jobs (now handled by release-sync)
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
    'sync-agent-release-content',
    'sync-release-content',
    'sync-release-from-codebase',
    'sync-release-from-repo',
    'sync-scripts-direct',
    'sync-agent-script',
    'sync-release-cron'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Some cron jobs may not exist: %', SQLERRM;
END $$;
