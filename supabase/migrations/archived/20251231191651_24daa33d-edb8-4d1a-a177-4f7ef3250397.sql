-- Fix: Remover SECURITY DEFINER da view (usar SECURITY INVOKER - padrao)
DROP VIEW IF EXISTS job_failure_health;

CREATE VIEW job_failure_health AS
SELECT
  failure_class,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '24h') AS last_24h,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS last_7d,
  CASE 
    WHEN failure_class IN ('TRANSIENT') THEN true
    ELSE false
  END AS is_retryable
FROM jobs
WHERE status = 'failed'
GROUP BY failure_class;