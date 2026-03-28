-- Fix: Recriar view com SECURITY INVOKER (padrao seguro)
DROP VIEW IF EXISTS public.v_pipeline_health_metrics;

CREATE VIEW public.v_pipeline_health_metrics 
WITH (security_invoker = on)
AS
SELECT
  DATE_TRUNC('hour', j.created_at) AS hour,
  j.type,
  COUNT(*) AS total_jobs,
  COUNT(*) FILTER (WHERE j.status = 'completed') AS completed_jobs,
  COUNT(*) FILTER (WHERE j.status = 'failed') AS failed_jobs,
  COUNT(*) FILTER (WHERE j.status = 'queued') AS queued_jobs,
  COUNT(*) FILTER (WHERE j.status = 'in_progress') AS in_progress_jobs,
  ROUND(
    CASE 
      WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE j.status = 'completed'))::numeric / COUNT(*) * 100
      ELSE 0
    END, 2
  ) AS success_rate,
  COUNT(*) FILTER (
    WHERE j.status = 'completed'
      AND j.type = 'collect_web_activity'
      AND EXISTS (
        SELECT 1 FROM public.agent_web_activity aw
        WHERE aw.agent_id = j.agent_id
          AND aw.created_at >= j.created_at
      )
  ) AS completed_with_data,
  COUNT(*) FILTER (
    WHERE j.status = 'completed'
      AND j.type IN ('collect_web_activity', 'software_inventory_collect', 'collect_antivirus_status')
      AND j.output IS NULL
  ) AS silent_failures
FROM public.jobs j
WHERE j.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', j.created_at), j.type
ORDER BY hour DESC;

COMMENT ON VIEW public.v_pipeline_health_metrics IS 
  'Metricas de saude do pipeline de jobs por hora. Usa security_invoker para respeitar RLS.';