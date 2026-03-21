-- ============================================================
-- COST-OPT v8: flush-event-buffer 60s → 120s
-- Saves ~720 invocations/day (~21,600/month)
-- The inline triggerBufferFlush ensures real-time latency is maintained
-- ============================================================

SELECT cron.unschedule('flush-event-buffer-every-60s');

SELECT cron.schedule(
  'flush-event-buffer-every-120s',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/flush-event-buffer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);