
-- ============================================================
-- COST-OPT v7: Reduce edge function invocations by ~85%
-- Main target: flush-event-buffer (10s → 60s) = -7,776 inv/day
-- ============================================================

-- 1. FLUSH-EVENT-BUFFER: 10s → 60s (saves ~7,776 invocations/day)
SELECT cron.unschedule('flush-event-buffer-every-10s');

SELECT cron.schedule(
  'flush-event-buffer-every-60s',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/flush-event-buffer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron-60s"}'::jsonb
  ) AS request_id;
  $$
);

-- 2. HOURLY → EVERY 6H

SELECT cron.unschedule('scheduled-compliance-refresh-hourly');
SELECT cron.schedule(
  'scheduled-compliance-refresh-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/scheduled-compliance-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('alert-high-failure-rate-15min');
SELECT cron.schedule(
  'alert-high-failure-rate-2h',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/alert-high-failure-rate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('check-expiring-enrollment-keys');
SELECT cron.schedule(
  'check-expiring-enrollment-keys-12h',
  '0 */12 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/check-expiring-enrollment-keys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('check-pending-agents-every-15min');
SELECT cron.schedule(
  'check-pending-agents-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/check-pending-agents',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('cron-sentinel-check-every-10min');
SELECT cron.schedule(
  'cron-sentinel-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/cron-sentinel',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('monitor-dlq-exhaustion-every-30min');
SELECT cron.schedule(
  'monitor-dlq-exhaustion-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/monitor-dlq-exhaustion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 3. EVERY 2H → EVERY 6H or DAILY

SELECT cron.unschedule('cleanup-stale-reports-hourly');
SELECT cron.schedule(
  'cleanup-stale-reports-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/cleanup-stale-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('detect-stuck-installations-15min');
SELECT cron.schedule(
  'detect-stuck-installations-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/detect-stuck-installations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('auto-execute-ai-actions-every-15min');
SELECT cron.schedule(
  'auto-execute-ai-actions-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/auto-execute-ai-actions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('evaluate-automation-rules-30min');
SELECT cron.schedule(
  'evaluate-automation-rules-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/evaluate-automation-rules',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('security-alert-dispatcher-15min');
SELECT cron.schedule(
  'security-alert-dispatcher-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/security-alert-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('monitor-thresholds-hourly');
SELECT cron.schedule(
  'monitor-thresholds-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/monitor-thresholds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 4. process-scheduled-jobs: 15min → 2h
SELECT cron.unschedule('process-scheduled-jobs');
SELECT cron.schedule(
  'process-scheduled-jobs-2h',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1) || '/functions/v1/process-scheduled-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);
