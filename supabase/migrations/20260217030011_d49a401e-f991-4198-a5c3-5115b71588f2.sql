
-- Fix calculate_pipeline_metrics to use real agent data instead of only analytics events
CREATE OR REPLACE FUNCTION public.calculate_pipeline_metrics(
  p_tenant_id uuid,
  p_hours_back integer DEFAULT NULL
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamp with time zone;
BEGIN
  IF p_hours_back IS NULL THEN
    v_cutoff := '1970-01-01'::timestamp with time zone;
  ELSE
    v_cutoff := now() - (p_hours_back || ' hours')::interval;
  END IF;
  
  RETURN QUERY
  WITH analytics_events AS (
    -- Count UNIQUE agents per event type from analytics (not raw event count)
    SELECT
      COUNT(DISTINCT agent_name) FILTER (WHERE event_type = 'generated') as unique_generated,
      COUNT(DISTINCT agent_name) FILTER (WHERE event_type = 'downloaded') as unique_downloaded,
      COUNT(DISTINCT agent_name) FILTER (WHERE event_type = 'command_copied') as unique_copied,
      AVG(installation_time_seconds) FILTER (WHERE event_type IN ('installed', 'post_installation') AND success = true) as avg_time
    FROM installation_analytics
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_cutoff
  ),
  real_agent_data AS (
    -- Use actual agents table for installed/active counts (source of truth)
    SELECT
      COUNT(*) as total_enrolled,
      COUNT(*) FILTER (WHERE last_heartbeat IS NOT NULL) as total_with_heartbeat,
      COUNT(*) FILTER (WHERE status = 'active' AND last_heartbeat >= now() - interval '10 minutes') as currently_active,
      COUNT(*) FILTER (WHERE status = 'active' AND (last_heartbeat IS NULL OR last_heartbeat < now() - interval '30 minutes')) as stuck_count
    FROM agents
    WHERE tenant_id = p_tenant_id
      AND (p_hours_back IS NULL OR enrolled_at >= v_cutoff)
  ),
  combined AS (
    SELECT
      -- For generated/downloaded/copied: use analytics unique counts (these track UI events)
      GREATEST(ae.unique_generated, rad.total_enrolled)::bigint as v_generated,
      GREATEST(ae.unique_downloaded, 0)::bigint as v_downloaded,
      GREATEST(ae.unique_copied, 0)::bigint as v_copied,
      -- For installed: use real agent data (agents with at least one heartbeat = successfully installed)
      rad.total_with_heartbeat::bigint as v_installed,
      -- For active: use real agent data with 10-min threshold (system standard)
      rad.currently_active::bigint as v_active,
      rad.stuck_count::bigint as v_stuck,
      ae.avg_time as v_avg_time
    FROM analytics_events ae
    CROSS JOIN real_agent_data rad
  )
  SELECT
    c.v_generated,
    c.v_downloaded,
    c.v_copied,
    c.v_installed,
    c.v_active,
    c.v_stuck,
    -- Success rate = installed / generated (how many generated commands led to real installs)
    CASE 
      WHEN c.v_generated > 0 
      THEN ROUND((c.v_installed::numeric / c.v_generated::numeric) * 100, 1)
      ELSE 0
    END,
    COALESCE(ROUND(c.v_avg_time::numeric, 0), 0),
    CASE 
      WHEN c.v_generated > 0 
      THEN ROUND((c.v_installed::numeric / c.v_generated::numeric) * 100, 1)
      ELSE 0
    END,
    CASE 
      WHEN c.v_copied > 0 
      THEN ROUND((c.v_installed::numeric / c.v_copied::numeric) * 100, 1)
      ELSE 0
    END
  FROM combined c;
END;
$$;
