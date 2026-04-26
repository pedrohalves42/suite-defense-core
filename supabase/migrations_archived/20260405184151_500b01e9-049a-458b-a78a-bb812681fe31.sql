
-- 1. Remove crons antigos se existirem (safe com exception handler)
DO $$
BEGIN
  PERFORM cron.unschedule('honeypot-dispatch-ai');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-hmac-signatures');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('honeypot-update-agent-timestamps');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('check-tenant-abuse');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('check-tenant-abuse-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- 2. Criar purge-hmac-signatures 1x/dia às 04:00 UTC
SELECT cron.schedule(
  'purge-hmac-signatures',
  '0 4 * * *',
  $$
  DELETE FROM public.hmac_signatures
  WHERE used_at IS NOT NULL
    AND used_at < now() - interval '10 minutes';
  $$
);

-- 3. Criar honeypot-update-agent-timestamps 1x/hora (minuto 10)
SELECT cron.schedule(
  'honeypot-update-agent-timestamps',
  '10 * * * *',
  $$
  UPDATE public.agents
  SET last_honeypot_interaction_at = sub.max_ts
  FROM (
    SELECT agent_id, MAX(created_at) AS max_ts
    FROM public.honeypot_interactions
    WHERE created_at > now() - interval '2 hours'
    GROUP BY agent_id
  ) sub
  WHERE agents.id = sub.agent_id
    AND agents.honeypot_mode != 'none';
  $$
);

-- 4. Criar check-tenant-abuse horário (minuto 5)
SELECT cron.schedule(
  'check-tenant-abuse-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/check-tenant-abuse',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED_JWT_TOKEN>"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- 5. Limpar health record do cron removido (já não existe no pg_cron)
DELETE FROM public.cron_health WHERE cron_name = 'evaluate-automation-rules-5min';
