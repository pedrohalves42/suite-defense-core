
-- Corrigir view job_failure_health para usar SECURITY INVOKER
DROP VIEW IF EXISTS job_failure_health;

CREATE VIEW job_failure_health 
WITH (security_invoker = true)
AS
SELECT 
  failure_class,
  count(*) AS total,
  count(*) FILTER (WHERE created_at >= (now() - '24:00:00'::interval)) AS last_24h,
  count(*) FILTER (WHERE created_at >= (now() - '7 days'::interval)) AS last_7d,
  CASE
    WHEN failure_class = 'TRANSIENT'::text THEN true
    ELSE false
  END AS is_retryable
FROM jobs
WHERE status = 'failed'::text
GROUP BY failure_class;
