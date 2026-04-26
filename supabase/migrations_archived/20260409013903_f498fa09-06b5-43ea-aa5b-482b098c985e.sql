-- Upgrade purge_expired_hmac_signatures with anomaly alert for >100k deletions
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
  v_alert_threshold integer := 100000;
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

  -- Alert on anomalous purge volume
  IF total_deleted > v_alert_threshold THEN
    INSERT INTO public.system_alerts (
      alert_type, severity, title, description, metadata, resolved
    ) VALUES (
      'hmac_purge_anomaly',
      'warning',
      'HMAC purge deleted anomalous volume',
      format('purge_expired_hmac_signatures deleted %s rows (threshold: %s). Investigate potential abuse or replay storm.', total_deleted, v_alert_threshold),
      jsonb_build_object(
        'total_deleted', total_deleted,
        'threshold', v_alert_threshold,
        'cutoff', cutoff,
        'executed_at', now()
      ),
      false
    );
    RAISE WARNING '[purge_expired_hmac_signatures] ANOMALY: Deleted % rows exceeds threshold %', total_deleted, v_alert_threshold;
  END IF;

  RETURN total_deleted;
END;
$$;