
-- Drop and recreate sync function with correct signature
DROP FUNCTION IF EXISTS public.sync_pgcron_health_from_run_details();

CREATE OR REPLACE FUNCTION public.sync_pgcron_health_from_run_details()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT 
      j.jobname,
      jrd.status AS run_status,
      jrd.start_time,
      jrd.end_time,
      jrd.return_message
    FROM cron.job_run_details jrd
    JOIN cron.job j ON j.jobid = jrd.jobid
    WHERE jrd.start_time > now() - interval '10 minutes'
    ORDER BY jrd.start_time DESC
  LOOP
    IF v_rec.run_status = 'succeeded' THEN
      PERFORM update_cron_health(v_rec.jobname, true, NULL);
    ELSE
      PERFORM update_cron_health(v_rec.jobname, false, v_rec.return_message);
    END IF;
  END LOOP;
END;
$$;
