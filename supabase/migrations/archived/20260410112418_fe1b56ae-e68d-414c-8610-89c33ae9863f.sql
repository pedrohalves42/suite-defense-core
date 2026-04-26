-- 1. Remove and recreate check-tenant-abuse with 6h interval
SELECT cron.unschedule('check-tenant-abuse-hourly');

SELECT cron.schedule(
  'check-tenant-abuse-6h',
  '5 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/check-tenant-abuse',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 2. Remove redundant crons
SELECT cron.unschedule('honeypot-hourly-aggregate');
SELECT cron.unschedule('migrate-network-events-batch');
SELECT cron.unschedule('ensure-partition-rls-hourly');
SELECT cron.unschedule('purge-hmac-signatures');