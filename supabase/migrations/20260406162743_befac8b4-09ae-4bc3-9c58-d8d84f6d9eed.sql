-- Otimização FinOps: reduzir frequência de crons não-críticos

-- 1. honeypot-alerts-check: de */6h para 1x/dia (06:00 UTC)
SELECT cron.unschedule('honeypot-alerts-check-6h');

SELECT cron.schedule(
  'honeypot-alerts-check-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/ops-gateway',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED_JWT_TOKEN>"}'::jsonb,
    body := '{"action":"check:honeypot-alerts","payload":{}}'::jsonb
  );
  $$
);

-- 2. refresh-dashboard-matviews: de */6h para 2x/dia (06:15 e 18:15 UTC)
SELECT cron.unschedule('refresh-dashboard-matviews');

SELECT cron.schedule(
  'refresh-dashboard-matviews-2x',
  '15 6,18 * * *',
  $$SELECT refresh_dashboard_matviews()$$
);