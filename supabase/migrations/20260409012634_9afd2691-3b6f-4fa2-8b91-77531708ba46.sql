-- Function: batch-delete expired HMAC signatures (>7 days)
CREATE OR REPLACE FUNCTION public.purge_expired_hmac_signatures()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_deleted integer := 0;
  batch_deleted integer;
  cutoff timestamptz := now() - interval '7 days';
BEGIN
  LOOP
    DELETE FROM public.hmac_signatures
    WHERE id IN (
      SELECT id FROM public.hmac_signatures
      WHERE used_at < cutoff
      LIMIT 1000
    );
    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    total_deleted := total_deleted + batch_deleted;
    EXIT WHEN batch_deleted < 1000;
  END LOOP;

  RAISE NOTICE '[purge_expired_hmac_signatures] Deleted % rows (cutoff: %)', total_deleted, cutoff;
  RETURN total_deleted;
END;
$$;

-- Schedule: daily at 03:00 UTC
SELECT cron.schedule(
  'purge-hmac-signatures',
  '0 3 * * *',
  $$SELECT public.purge_expired_hmac_signatures()$$
);

-- Initial purge of existing stale data
SELECT public.purge_expired_hmac_signatures();