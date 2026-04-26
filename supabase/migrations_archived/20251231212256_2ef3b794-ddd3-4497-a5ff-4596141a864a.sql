
-- Fix SECURITY DEFINER view issue - recreate as SECURITY INVOKER (default)
DROP VIEW IF EXISTS public.v_ai_anomalies;

CREATE VIEW public.v_ai_anomalies 
WITH (security_invoker = true) 
AS
WITH action_stats AS (
  SELECT 
    a.action_type, 
    a.tenant_id, 
    COUNT(*) as total_actions,
    COUNT(*) FILTER (WHERE ae.execution_status = 'executed') as executed,
    COUNT(*) FILTER (WHERE ae.execution_status = 'failed') as failed,
    COUNT(*) FILTER (WHERE i.status = 'resolved') as resolved_insights
  FROM ai_actions a
  LEFT JOIN ai_action_executions ae ON a.id = ae.action_id
  LEFT JOIN ai_insights i ON a.insight_id = i.id
  WHERE a.created_at > NOW() - interval '7 days'
  GROUP BY a.action_type, a.tenant_id
)
SELECT *, 
  CASE 
    WHEN total_actions > 0 AND resolved_insights::float / total_actions < 0.1 THEN 'low_resolution_rate'
    WHEN failed > executed THEN 'high_failure_rate'
    ELSE NULL
  END as anomaly_type,
  CASE 
    WHEN total_actions > 0 AND resolved_insights::float / total_actions < 0.1 THEN 'critical'
    WHEN failed > executed THEN 'high'
    ELSE 'none'
  END as severity
FROM action_stats 
WHERE total_actions > 0 AND (
  (resolved_insights::float / total_actions < 0.1) OR (failed > executed)
);
