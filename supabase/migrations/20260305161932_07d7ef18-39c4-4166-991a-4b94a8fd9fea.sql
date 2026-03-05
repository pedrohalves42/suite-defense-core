-- Keep scheduled_jobs observability in sync with actual cron executions

CREATE OR REPLACE FUNCTION public.log_scheduled_job_run(
  p_job_key text,
  p_success boolean,
  p_duration_ms integer DEFAULT NULL::integer,
  p_error text DEFAULT NULL::text,
  p_result jsonb DEFAULT NULL::jsonb,
  p_processed_count integer DEFAULT 0,
  p_job_source text DEFAULT 'cron'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.scheduled_job_runs (
    job_key,
    job_source,
    ran_at,
    success,
    duration_ms,
    error,
    result,
    processed_count
  ) VALUES (
    p_job_key,
    COALESCE(p_job_source, 'cron'),
    NOW(),
    p_success,
    p_duration_ms,
    p_error,
    p_result,
    p_processed_count
  )
  RETURNING id INTO v_id;

  -- Keep scheduled_jobs metadata fresh only for successful runs
  IF p_success THEN
    UPDATE public.scheduled_jobs sj
    SET
      last_run_at = NOW(),
      next_run_at = CASE
        WHEN sj.cron_expr IS NOT NULL THEN public.calculate_next_run(sj.cron_expr, NOW())
        ELSE sj.next_run_at
      END,
      updated_at = NOW()
    WHERE
      lower(replace(sj.job_key, '_', '-')) = lower(replace(p_job_key, '_', '-'))
      OR lower(replace(COALESCE(sj.job_type, ''), '_', '-')) = lower(replace(p_job_key, '_', '-'))
      OR lower(replace(COALESCE(sj.payload->>'function_name', ''), '_', '-')) = lower(replace(p_job_key, '_', '-'));
  END IF;

  RETURN v_id;
END;
$function$;

-- Backfill stale scheduled_jobs rows from historical successful runs
WITH run_norm AS (
  SELECT
    lower(replace(job_key, '_', '-')) AS normalized_key,
    MAX(ran_at) AS last_success_at
  FROM public.scheduled_job_runs
  WHERE success = true
  GROUP BY 1
),
job_matches AS (
  SELECT
    sj.id,
    (
      SELECT MAX(v)
      FROM (VALUES
        (r1.last_success_at),
        (r2.last_success_at),
        (r3.last_success_at)
      ) AS candidates(v)
    ) AS last_success_at
  FROM public.scheduled_jobs sj
  LEFT JOIN run_norm r1 ON r1.normalized_key = lower(replace(sj.job_key, '_', '-'))
  LEFT JOIN run_norm r2 ON r2.normalized_key = lower(replace(COALESCE(sj.job_type, ''), '_', '-'))
  LEFT JOIN run_norm r3 ON r3.normalized_key = lower(replace(COALESCE(sj.payload->>'function_name', ''), '_', '-'))
)
UPDATE public.scheduled_jobs sj
SET
  last_run_at = jm.last_success_at,
  next_run_at = CASE
    WHEN sj.cron_expr IS NOT NULL THEN public.calculate_next_run(sj.cron_expr, jm.last_success_at)
    ELSE sj.next_run_at
  END,
  updated_at = NOW()
FROM job_matches jm
WHERE jm.id = sj.id
  AND jm.last_success_at IS NOT NULL
  AND (sj.last_run_at IS NULL OR jm.last_success_at > sj.last_run_at);