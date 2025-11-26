-- ====================================================================
-- PHASE 1 COMPLETION: Fix Views with Missing Fields
-- ====================================================================

-- Drop existing views to recreate with complete field sets
DROP VIEW IF EXISTS public.v_agent_lifecycle_state CASCADE;
DROP VIEW IF EXISTS public.v_problematic_agents CASCADE;

-- ====================================================================
-- 1. Recreate v_agent_lifecycle_state with ALL necessary fields
-- ====================================================================
CREATE VIEW public.v_agent_lifecycle_state
WITH (security_invoker = on)
AS
SELECT 
  a.id as agent_id,
  a.tenant_id,
  a.agent_name,
  a.status as agent_status,
  a.os_type,
  a.os_version,
  a.hostname,
  a.agent_version,
  a.enrolled_at,
  a.last_heartbeat,
  
  -- Lifecycle stage timestamps
  ek.created_at as generated_at,
  ek.installer_generated_at as downloaded_at,
  ia_copy.created_at as command_copied_at,
  ia_install.created_at as installed_at,
  
  -- Lifecycle stage determination
  CASE 
    WHEN a.last_heartbeat > NOW() - INTERVAL '5 minutes' THEN 'active'
    WHEN a.last_heartbeat IS NOT NULL THEN 'inactive'
    WHEN ia_install.success = true THEN 'installed'
    WHEN ia_copy.created_at IS NOT NULL THEN 'command_copied'
    WHEN ek.installer_generated_at IS NOT NULL THEN 'downloaded'
    WHEN ek.created_at IS NOT NULL THEN 'generated'
    ELSE 'pending'
  END as lifecycle_stage,
  
  -- Time metrics
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER / 60 as minutes_since_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at))::INTEGER / 60 as minutes_since_enrollment,
  EXTRACT(EPOCH FROM (ia_install.created_at - ia_copy.created_at))::INTEGER / 60 as minutes_between_copy_and_install,
  EXTRACT(EPOCH FROM (ia_install.created_at - a.enrolled_at))::INTEGER as installation_time_seconds,
  
  -- Installation metadata
  ia_install.platform,
  ia_install.installation_method,
  ia_install.success as installation_success,
  ia_install.network_connectivity,
  ia_install.metadata as installation_metadata,
  
  -- Error tracking
  ia_install.error_message as last_error_message,
  ia_install.created_at as last_error_at,
  
  -- Stuck detection
  CASE 
    WHEN a.status = 'pending' 
      AND a.last_heartbeat IS NULL 
      AND a.enrolled_at < NOW() - INTERVAL '10 minutes' THEN true
    WHEN ia_install.success = false 
      AND ia_install.created_at > NOW() - INTERVAL '24 hours' THEN true
    ELSE false
  END as is_stuck

FROM public.agents a
LEFT JOIN public.enrollment_keys ek ON ek.agent_id = a.id
LEFT JOIN LATERAL (
  SELECT created_at 
  FROM public.installation_analytics 
  WHERE agent_id = a.id 
    AND event_type = 'command_copied' 
  ORDER BY created_at DESC 
  LIMIT 1
) ia_copy ON true
LEFT JOIN LATERAL (
  SELECT created_at, success, error_message, network_connectivity, platform, installation_method, metadata
  FROM public.installation_analytics 
  WHERE agent_id = a.id 
    AND event_type IN ('post_installation', 'installation_failed')
  ORDER BY created_at DESC 
  LIMIT 1
) ia_install ON true
WHERE a.tenant_id IN (
  SELECT tenant_id 
  FROM public.user_roles 
  WHERE user_id = auth.uid()
);

-- ====================================================================
-- 2. Recreate v_problematic_agents with ALL necessary fields
-- ====================================================================
CREATE VIEW public.v_problematic_agents
WITH (security_invoker = on)
AS
SELECT 
  a.id,
  a.tenant_id,
  a.agent_name,
  a.status,
  a.enrolled_at as created_at,
  a.enrolled_at,
  a.last_heartbeat,
  t.name as tenant_name,
  
  -- Time metrics
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at))::numeric / 60 as minutes_since_creation,
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at))::numeric / 60 as minutes_since_enrollment,
  
  -- Installation data
  ia.success as installation_success,
  ia.network_connectivity,
  ia.metadata,
  
  -- Token status
  (SELECT COUNT(*) FROM public.agent_tokens WHERE agent_id = a.id) as token_count,
  (SELECT EXISTS(SELECT 1 FROM public.agent_tokens WHERE agent_id = a.id AND is_active = true)) as has_active_token,
  
  -- Job status
  (SELECT COUNT(*) FROM public.jobs WHERE agent_id = a.id AND status = 'queued') as pending_jobs_count,
  
  -- Problem classification
  CASE 
    WHEN a.last_heartbeat IS NULL AND a.enrolled_at < NOW() - INTERVAL '10 minutes' THEN 'never_connected'
    WHEN ia.success = false THEN 'installation_failed'
    WHEN NOT EXISTS(SELECT 1 FROM public.agent_tokens WHERE agent_id = a.id AND is_active = true) THEN 'no_active_token'
    ELSE 'stuck_pending'
  END as problem_type,
  
  CASE 
    WHEN a.last_heartbeat IS NULL AND a.enrolled_at < NOW() - INTERVAL '10 minutes' THEN 'never_connected'
    WHEN ia.success = false THEN 'installation_failed'
    WHEN NOT EXISTS(SELECT 1 FROM public.agent_tokens WHERE agent_id = a.id AND is_active = true) THEN 'no_active_token'
    ELSE 'stuck_pending'
  END as issue_type

FROM public.agents a
LEFT JOIN public.tenants t ON t.id = a.tenant_id
LEFT JOIN LATERAL (
  SELECT success, network_connectivity, metadata
  FROM public.installation_analytics
  WHERE agent_id = a.id
    AND event_type IN ('post_installation', 'installation_failed')
  ORDER BY created_at DESC
  LIMIT 1
) ia ON true
WHERE a.status = 'pending'
  AND a.last_heartbeat IS NULL
  AND a.enrolled_at < NOW() - INTERVAL '5 minutes'
  AND a.tenant_id IN (
    SELECT tenant_id 
    FROM public.user_roles 
    WHERE user_id = auth.uid()
  );

-- ====================================================================
-- PHASE 2: Restrict agent_releases table access
-- ====================================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "agents_can_read_versions" ON public.agent_releases;
DROP POLICY IF EXISTS "super_admins_can_manage_versions" ON public.agent_releases;

-- Create restricted policies for agent_releases
CREATE POLICY "super_admins_can_manage_agent_releases"
ON public.agent_releases
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
      AND role = 'super_admin'
  )
);

CREATE POLICY "admins_can_view_agent_releases"
ON public.agent_releases
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
  )
);

-- Create public view for agents checking updates (without script_content)
CREATE VIEW public.agent_releases_public
WITH (security_invoker = on)
AS
SELECT 
  id,
  version,
  platform,
  sha256,
  release_notes,
  channel,
  is_active,
  created_at,
  created_by
FROM public.agent_releases
WHERE is_active = true;

-- Allow authenticated users to check for updates via public view
GRANT SELECT ON public.agent_releases_public TO authenticated;

COMMENT ON VIEW public.agent_releases_public IS 'Public view of agent releases without sensitive script_content, used by agents to check for updates';