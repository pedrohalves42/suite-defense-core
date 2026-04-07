
-- Add cron job for compute-compliance-benchmarks (daily at 5am UTC)
SELECT cron.schedule(
  'compute-compliance-benchmarks-daily',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/compute-compliance-benchmarks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <REDACTED_JWT_TOKEN>'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
