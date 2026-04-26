-- P1-SEC Fix 1: Recreate v_job_health with security_invoker=on
DROP VIEW IF EXISTS public.v_job_health;
CREATE VIEW public.v_job_health WITH (security_invoker = on, security_barrier = true) AS
SELECT job_key,
    job_source,
    count(*) AS total_runs_24h,
    count(*) FILTER (WHERE (success IS TRUE)) AS success_count_24h,
    count(*) FILTER (WHERE (success IS FALSE)) AS failure_count_24h,
    max(ran_at) AS last_run,
    max(ran_at) FILTER (WHERE (success IS TRUE)) AS last_success,
    max(ran_at) FILTER (WHERE (success IS FALSE)) AS last_failure,
    (avg(duration_ms))::numeric(10,2) AS avg_duration_ms,
    (max(duration_ms))::numeric(10,2) AS max_duration_ms,
    CASE
        WHEN (count(*) = 0) THEN 'never_ran'::text
        WHEN (max(ran_at) < (now() - '02:00:00'::interval)) THEN 'stale'::text
        WHEN (count(*) FILTER (WHERE ((success IS FALSE) AND (ran_at > (now() - '01:00:00'::interval)))) > 3) THEN 'critical'::text
        WHEN (count(*) FILTER (WHERE ((success IS FALSE) AND (ran_at > (now() - '02:00:00'::interval)))) > 0) THEN 'warning'::text
        ELSE 'healthy'::text
    END AS health_status,
    CASE
        WHEN (count(*) = 0) THEN 'low'::text
        WHEN (max(ran_at) < (now() - '02:00:00'::interval)) THEN 'medium'::text
        WHEN (count(*) FILTER (WHERE ((success IS FALSE) AND (ran_at > (now() - '01:00:00'::interval)))) > 3) THEN 'critical'::text
        WHEN (count(*) FILTER (WHERE ((success IS FALSE) AND (ran_at > (now() - '02:00:00'::interval)))) > 0) THEN 'high'::text
        ELSE 'low'::text
    END AS severity
FROM scheduled_job_runs
WHERE ((ran_at > (now() - '24:00:00'::interval)) AND is_current_super_admin())
GROUP BY job_key, job_source;