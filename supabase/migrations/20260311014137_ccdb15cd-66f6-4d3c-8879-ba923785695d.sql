
-- Add cron job for compute-compliance-benchmarks (daily at 5am UTC)
SELECT cron.schedule(
  'compute-compliance-benchmarks-daily',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/compute-compliance-benchmarks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTg3OTMzMiwiZXhwIjoyMDc1NDU1MzMyfQ.***REMOVED***'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
