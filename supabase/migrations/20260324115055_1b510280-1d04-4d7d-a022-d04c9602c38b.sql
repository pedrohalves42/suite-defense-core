-- COST-OPT v9: Consolidate cleanup cron jobs into single maintenance-cron
-- Remove individual cleanup crons (now handled by maintenance-cron)

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
    'cleanup-stuck-jobs-every-15min',
    'cleanup-stuck-jobs',
    'auto-cleanup-jobs',
    'auto-cleanup-stale-operations',
    'cleanup-offline-agents-jobs',
    'cleanup-stale-playbooks',
    'cleanup-stale-reports-daily',
    'cleanup-stale-updates',
    'cleanup-stuck-builds',
    'cleanup-telemetry'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Some cron jobs may not exist: %', SQLERRM;
END $$;