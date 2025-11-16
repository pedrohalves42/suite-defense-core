-- FASE 4: Agent Versioning System (CORRIGIDO)
-- Drop and recreate view to avoid column order issues

-- Add version column to agents table
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS agent_version TEXT DEFAULT '1.0.0';

COMMENT ON COLUMN public.agents.agent_version IS 'Semantic version reported by agent (e.g., 3.0.0)';

-- Create index for faster version queries
CREATE INDEX IF NOT EXISTS idx_agents_version ON public.agents(agent_version);

-- Drop existing view to recreate with new columns
DROP VIEW IF EXISTS public.v_agent_health_summary CASCADE;
DROP VIEW IF EXISTS public.v_agent_lifecycle_state CASCADE;

-- Recreate v_agent_lifecycle_state view with agent_version
CREATE VIEW public.v_agent_lifecycle_state AS
SELECT
  a.id AS agent_id,
  a.tenant_id,
  a.agent_name,
  a.os_type,
  a.os_version,
  a.hostname,
  a.agent_version,
  a.status AS agent_status,
  a.last_heartbeat,
  a.enrolled_at,
  a.payload_hash,
  
  -- Installation analytics data
  ia_gen.created_at AS generated_at,
  ia_dl.created_at AS downloaded_at,
  ia_copy.created_at AS command_copied_at,
  ia_inst.created_at AS installed_at,
  ia_inst.installation_time_seconds,
  ia_inst.success AS installation_success,
  ia_inst.network_connectivity,
  ia_inst.metadata AS installation_metadata,
  ia_inst.installation_method,
  ia_inst.platform,
  
  -- Error tracking
  ia_err.created_at AS last_error_at,
  ia_err.error_message AS last_error_message,
  
  -- Lifecycle stage calculation
  CASE
    WHEN a.last_heartbeat IS NOT NULL 
      AND a.last_heartbeat > NOW() - INTERVAL '5 minutes'
      THEN 'active'
    WHEN ia_inst.created_at IS NOT NULL
      AND (a.last_heartbeat IS NULL OR a.last_heartbeat <= NOW() - INTERVAL '5 minutes')
      THEN 'installed_offline'
    WHEN ia_copy.created_at IS NOT NULL
      AND ia_inst.created_at IS NULL
      THEN 'installing'
    WHEN ia_dl.created_at IS NOT NULL
      AND ia_copy.created_at IS NULL
      THEN 'downloaded'
    WHEN ia_gen.created_at IS NOT NULL
      AND ia_dl.created_at IS NULL
      THEN 'generated'
    ELSE 'pending'
  END AS lifecycle_stage,
  
  -- Time calculations
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) / 60 AS minutes_since_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at)) / 60 AS minutes_since_enrollment,
  CASE
    WHEN ia_copy.created_at IS NOT NULL AND ia_inst.created_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ia_inst.created_at - ia_copy.created_at)) / 60
    ELSE NULL
  END AS minutes_between_copy_and_install,
  
  -- Stuck detection
  CASE
    WHEN ia_copy.created_at IS NOT NULL 
      AND ia_inst.created_at IS NULL
      AND ia_copy.created_at < NOW() - INTERVAL '15 minutes'
      THEN true
    WHEN a.status = 'pending'
      AND a.last_heartbeat IS NULL
      AND a.enrolled_at < NOW() - INTERVAL '10 minutes'
      THEN true
    ELSE false
  END AS is_stuck

FROM public.agents a

-- Generated event (enrollment key created)
LEFT JOIN LATERAL (
  SELECT created_at
  FROM public.installation_analytics
  WHERE agent_id = a.id
    AND event_type = 'installer_generated'
  ORDER BY created_at ASC
  LIMIT 1
) ia_gen ON true

-- Downloaded event
LEFT JOIN LATERAL (
  SELECT created_at
  FROM public.installation_analytics
  WHERE agent_id = a.id
    AND event_type = 'installer_downloaded'
  ORDER BY created_at ASC
  LIMIT 1
) ia_dl ON true

-- Command copied event
LEFT JOIN LATERAL (
  SELECT created_at
  FROM public.installation_analytics
  WHERE agent_id = a.id
    AND event_type = 'command_copied'
  ORDER BY created_at ASC
  LIMIT 1
) ia_copy ON true

-- Installation event (post_installation or post_installation_unverified)
LEFT JOIN LATERAL (
  SELECT 
    created_at,
    installation_time_seconds,
    success,
    network_connectivity,
    metadata,
    installation_method,
    platform
  FROM public.installation_analytics
  WHERE agent_id = a.id
    AND event_type IN ('post_installation', 'post_installation_unverified')
  ORDER BY created_at DESC
  LIMIT 1
) ia_inst ON true

-- Last error event
LEFT JOIN LATERAL (
  SELECT created_at, error_message
  FROM public.installation_analytics
  WHERE agent_id = a.id
    AND success = false
    AND error_message IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
) ia_err ON true;

-- Create health summary view
CREATE VIEW public.v_agent_health_summary AS
SELECT
  a.id,
  a.agent_name,
  a.os_type,
  a.agent_version,
  a.last_heartbeat,
  a.tenant_id,
  v.lifecycle_stage,
  CASE
    WHEN v.lifecycle_stage = 'active' 
      AND a.last_heartbeat > NOW() - INTERVAL '5 minutes' 
      THEN 'healthy'
    WHEN v.lifecycle_stage = 'installing' THEN 'installing'
    WHEN v.lifecycle_stage = 'installed_offline' THEN 'offline'
    ELSE 'unknown'
  END AS health_status,
  CASE
    WHEN a.agent_version IS NOT NULL 
      AND a.agent_version < '3.0.0' 
      THEN true
    ELSE false
  END AS outdated,
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) / 60 AS minutes_since_heartbeat
FROM public.agents a
LEFT JOIN public.v_agent_lifecycle_state v ON v.agent_id = a.id;