-- ========================================
-- ORION DATAFLOW: Agent Lifecycle State View
-- Purpose: Consolidate agent status from multiple tables into unified view
-- ========================================

-- Create view for agent lifecycle state
CREATE OR REPLACE VIEW public.v_agent_lifecycle_state AS
SELECT 
  a.id as agent_id,
  a.agent_name,
  a.tenant_id,
  a.status as agent_status,
  a.enrolled_at,
  a.last_heartbeat,
  a.os_type,
  a.os_version,
  a.hostname,
  
  -- Installation stages timestamps
  MAX(CASE WHEN ia.event_type = 'generated' THEN ia.created_at END) as generated_at,
  MAX(CASE WHEN ia.event_type = 'downloaded' THEN ia.created_at END) as downloaded_at,
  MAX(CASE WHEN ia.event_type = 'command_copied' THEN ia.created_at END) as command_copied_at,
  MAX(CASE WHEN ia.event_type IN ('post_installation', 'post_installation_unverified') THEN ia.created_at END) as installed_at,
  
  -- Current lifecycle stage (most advanced stage reached)
  CASE
    WHEN MAX(CASE WHEN ia.event_type IN ('post_installation', 'post_installation_unverified') THEN 1 END) = 1 THEN 
      CASE WHEN a.last_heartbeat > NOW() - INTERVAL '5 minutes' THEN 'active' ELSE 'installed_offline' END
    WHEN MAX(CASE WHEN ia.event_type = 'command_copied' THEN 1 END) = 1 THEN 'installing'
    WHEN MAX(CASE WHEN ia.event_type = 'downloaded' THEN 1 END) = 1 THEN 'downloaded'
    WHEN MAX(CASE WHEN ia.event_type = 'generated' THEN 1 END) = 1 THEN 'generated'
    ELSE 'unknown'
  END as lifecycle_stage,
  
  -- Installation metrics
  MAX(ia.installation_time_seconds) as installation_time_seconds,
  BOOL_OR(CASE WHEN ia.event_type IN ('post_installation', 'post_installation_unverified') THEN ia.success ELSE NULL END) as installation_success,
  BOOL_OR(CASE WHEN ia.event_type IN ('post_installation', 'post_installation_unverified') THEN ia.network_connectivity ELSE NULL END) as network_connectivity,
  
  -- Error tracking
  MAX(CASE WHEN ia.success = false THEN ia.error_message END) as last_error_message,
  MAX(CASE WHEN ia.success = false THEN ia.created_at END) as last_error_at,
  
  -- Platform and method
  MAX(ia.platform) as platform,
  MAX(ia.installation_method) as installation_method,
  
  -- Metadata (use jsonb_object_agg for combining multiple metadata records)
  jsonb_object_agg(
    COALESCE(ia.event_type, 'unknown'),
    ia.metadata
  ) FILTER (WHERE ia.metadata IS NOT NULL) as installation_metadata,
  
  -- Time calculations
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER / 60 as minutes_since_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at))::INTEGER / 60 as minutes_since_enrollment,
  EXTRACT(EPOCH FROM (
    MAX(CASE WHEN ia.event_type IN ('post_installation', 'post_installation_unverified') THEN ia.created_at END) - 
    MAX(CASE WHEN ia.event_type = 'command_copied' THEN ia.created_at END)
  ))::INTEGER / 60 as minutes_between_copy_and_install,
  
  -- Stuck detection (command copied but no installation after 30min)
  CASE 
    WHEN MAX(CASE WHEN ia.event_type = 'command_copied' THEN ia.created_at END) IS NOT NULL
      AND MAX(CASE WHEN ia.event_type IN ('post_installation', 'post_installation_unverified') THEN ia.created_at END) IS NULL
      AND MAX(CASE WHEN ia.event_type = 'command_copied' THEN ia.created_at END) < NOW() - INTERVAL '30 minutes'
    THEN true
    ELSE false
  END as is_stuck
  
FROM public.agents a
LEFT JOIN public.installation_analytics ia ON ia.agent_id = a.id
GROUP BY a.id, a.agent_name, a.tenant_id, a.status, a.enrolled_at, a.last_heartbeat, 
         a.os_type, a.os_version, a.hostname;

-- Grant access to authenticated users
GRANT SELECT ON public.v_agent_lifecycle_state TO authenticated;

-- Create RLS policy for the view
ALTER VIEW public.v_agent_lifecycle_state SET (security_invoker = true);

-- ========================================
-- ORION DATAFLOW: Pipeline Metrics Function
-- Purpose: Calculate aggregated installation pipeline metrics
-- ========================================

CREATE OR REPLACE FUNCTION public.calculate_pipeline_metrics(
  p_tenant_id UUID DEFAULT NULL,
  p_hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
  total_generated BIGINT,
  total_downloaded BIGINT,
  total_command_copied BIGINT,
  total_installed BIGINT,
  total_active BIGINT,
  total_stuck BIGINT,
  success_rate_pct NUMERIC,
  avg_install_time_seconds NUMERIC,
  conversion_rate_generated_to_installed_pct NUMERIC,
  conversion_rate_copied_to_installed_pct NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH recent_agents AS (
    SELECT * FROM public.v_agent_lifecycle_state
    WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND enrolled_at > NOW() - (p_hours_back || ' hours')::INTERVAL
  )
  SELECT
    COUNT(DISTINCT CASE WHEN generated_at IS NOT NULL THEN agent_id END) as total_generated,
    COUNT(DISTINCT CASE WHEN downloaded_at IS NOT NULL THEN agent_id END) as total_downloaded,
    COUNT(DISTINCT CASE WHEN command_copied_at IS NOT NULL THEN agent_id END) as total_command_copied,
    COUNT(DISTINCT CASE WHEN installed_at IS NOT NULL THEN agent_id END) as total_installed,
    COUNT(DISTINCT CASE WHEN lifecycle_stage = 'active' THEN agent_id END) as total_active,
    COUNT(DISTINCT CASE WHEN is_stuck = true THEN agent_id END) as total_stuck,
    
    -- Success rate (installed / total that tried to install)
    CASE 
      WHEN COUNT(DISTINCT CASE WHEN command_copied_at IS NOT NULL THEN agent_id END) > 0
      THEN ROUND(
        (COUNT(DISTINCT CASE WHEN installed_at IS NOT NULL THEN agent_id END)::NUMERIC / 
         COUNT(DISTINCT CASE WHEN command_copied_at IS NOT NULL THEN agent_id END)::NUMERIC) * 100, 
        1
      )
      ELSE 0
    END as success_rate_pct,
    
    -- Average installation time
    ROUND(AVG(CASE WHEN installation_time_seconds > 0 THEN installation_time_seconds END), 1) as avg_install_time_seconds,
    
    -- Conversion rate: generated -> installed
    CASE 
      WHEN COUNT(DISTINCT CASE WHEN generated_at IS NOT NULL THEN agent_id END) > 0
      THEN ROUND(
        (COUNT(DISTINCT CASE WHEN installed_at IS NOT NULL THEN agent_id END)::NUMERIC / 
         COUNT(DISTINCT CASE WHEN generated_at IS NOT NULL THEN agent_id END)::NUMERIC) * 100, 
        1
      )
      ELSE 0
    END as conversion_rate_generated_to_installed_pct,
    
    -- Conversion rate: command copied -> installed
    CASE 
      WHEN COUNT(DISTINCT CASE WHEN command_copied_at IS NOT NULL THEN agent_id END) > 0
      THEN ROUND(
        (COUNT(DISTINCT CASE WHEN installed_at IS NOT NULL THEN agent_id END)::NUMERIC / 
         COUNT(DISTINCT CASE WHEN command_copied_at IS NOT NULL THEN agent_id END)::NUMERIC) * 100, 
        1
      )
      ELSE 0
    END as conversion_rate_copied_to_installed_pct
    
  FROM recent_agents;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_pipeline_metrics TO authenticated;