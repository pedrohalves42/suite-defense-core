-- Drop existing function and recreate with direct table queries
DROP FUNCTION IF EXISTS public.calculate_pipeline_metrics(uuid, integer);

CREATE OR REPLACE FUNCTION public.calculate_pipeline_metrics(
  p_tenant_id uuid,
  p_hours_back integer DEFAULT 24
)
RETURNS TABLE(
  total_generated bigint,
  total_downloaded bigint,
  total_command_copied bigint,
  total_installed bigint,
  total_active bigint,
  total_stuck bigint,
  success_rate_pct numeric,
  avg_install_time_seconds numeric,
  conversion_rate_generated_to_installed_pct numeric,
  conversion_rate_copied_to_installed_pct numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamp with time zone;
BEGIN
  v_cutoff := now() - (p_hours_back || ' hours')::interval;
  
  RETURN QUERY
  WITH event_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'generated') as generated,
      COUNT(*) FILTER (WHERE event_type = 'downloaded') as downloaded,
      COUNT(*) FILTER (WHERE event_type = 'command_copied') as command_copied,
      COUNT(*) FILTER (WHERE event_type IN ('installed', 'post_installation') AND success = true) as installed,
      AVG(installation_time_seconds) FILTER (WHERE event_type IN ('installed', 'post_installation') AND success = true) as avg_time
    FROM installation_analytics
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_cutoff
  ),
  agent_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'active' AND last_heartbeat >= now() - interval '5 minutes') as active,
      COUNT(*) FILTER (WHERE status = 'active' AND (last_heartbeat IS NULL OR last_heartbeat < now() - interval '30 minutes')) as stuck
    FROM agents
    WHERE tenant_id = p_tenant_id
      AND enrolled_at >= v_cutoff
  )
  SELECT
    COALESCE(ec.generated, 0)::bigint as total_generated,
    COALESCE(ec.downloaded, 0)::bigint as total_downloaded,
    COALESCE(ec.command_copied, 0)::bigint as total_command_copied,
    COALESCE(ec.installed, 0)::bigint as total_installed,
    COALESCE(ac.active, 0)::bigint as total_active,
    COALESCE(ac.stuck, 0)::bigint as total_stuck,
    CASE 
      WHEN COALESCE(ec.generated, 0) > 0 
      THEN ROUND((COALESCE(ec.installed, 0)::numeric / ec.generated::numeric) * 100, 2)
      ELSE 0
    END as success_rate_pct,
    COALESCE(ROUND(ec.avg_time::numeric, 2), 0) as avg_install_time_seconds,
    CASE 
      WHEN COALESCE(ec.generated, 0) > 0 
      THEN ROUND((COALESCE(ec.installed, 0)::numeric / ec.generated::numeric) * 100, 2)
      ELSE 0
    END as conversion_rate_generated_to_installed_pct,
    CASE 
      WHEN COALESCE(ec.command_copied, 0) > 0 
      THEN ROUND((COALESCE(ec.installed, 0)::numeric / ec.command_copied::numeric) * 100, 2)
      ELSE 0
    END as conversion_rate_copied_to_installed_pct
  FROM event_counts ec
  CROSS JOIN agent_counts ac;
END;
$$;