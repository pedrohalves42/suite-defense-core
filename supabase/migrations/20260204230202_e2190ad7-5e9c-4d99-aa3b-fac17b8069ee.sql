-- ============================================================================
-- SSA-SEC-003: Revoke ALL inherited grants from public views
-- Views already have tenant isolation in SQL, but anon grants allow access
-- ============================================================================

-- Revoke from all roles that could be public
DO $$
DECLARE
  v_views text[] := ARRAY[
    'profiles_public',
    'agents_public', 
    'agents_safe',
    'active_agents',
    'agent_releases_public',
    'enrollment_keys_safe',
    'invites_safe'
  ];
  v_view text;
BEGIN
  FOREACH v_view IN ARRAY v_views
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v_view);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_view);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_view);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', v_view);
  END LOOP;
END $$;

-- Add security_invoker to views that don't have it
-- profiles_public
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT 
  p.id,
  p.user_id,
  p.username,
  p.full_name,
  p.created_at
FROM public.profiles p
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.user_id 
    AND (ur.tenant_id = get_active_tenant_id() OR is_current_super_admin())
);

REVOKE ALL ON public.profiles_public FROM PUBLIC;
REVOKE ALL ON public.profiles_public FROM anon;
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO service_role;

-- agents_public
DROP VIEW IF EXISTS public.agents_public;
CREATE VIEW public.agents_public
WITH (security_invoker = on) AS
SELECT 
  id,
  tenant_id,
  agent_name,
  hostname,
  status,
  os_type,
  os_version,
  agent_version,
  display_name,
  enrolled_at,
  last_heartbeat,
  agent_mode,
  agent_state,
  agent_state_reason,
  agent_state_changed_at
FROM public.agents
WHERE (tenant_id = get_active_tenant_id() OR is_current_super_admin())
  AND archived_at IS NULL;

REVOKE ALL ON public.agents_public FROM PUBLIC;
REVOKE ALL ON public.agents_public FROM anon;
GRANT SELECT ON public.agents_public TO authenticated;
GRANT SELECT ON public.agents_public TO service_role;

-- agents_safe  
DROP VIEW IF EXISTS public.agents_safe;
CREATE VIEW public.agents_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  tenant_id,
  agent_name,
  hostname,
  status,
  os_type,
  os_version,
  agent_version,
  agent_version_code,
  display_name,
  enrolled_at,
  last_heartbeat,
  last_block_sync_at,
  poll_interval_seconds,
  agent_mode,
  agent_state,
  agent_state_reason,
  agent_state_changed_at,
  safe_mode_reason,
  safe_mode_entered_at,
  is_throttled,
  throttled_at,
  throttle_reason,
  is_isolated,
  isolated_at,
  isolation_reason,
  archived_at,
  archived_reason,
  force_update_version,
  force_update_reason,
  force_update_at,
  force_update_override_safe_mode,
  force_update_override_safe_mode_expires_at,
  last_forced_update_applied,
  offline_reason,
  offline_detected_at,
  ed25519_supported,
  signature_mode,
  result_public_key,
  result_key_fingerprint,
  result_key_registered_at,
  requires_revalidation,
  revalidation_reason,
  revalidation_required_at
FROM public.agents
WHERE (tenant_id = get_active_tenant_id() 
  OR (get_active_tenant_id() IS NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.tenant_id = agents.tenant_id
  ))
  OR is_current_super_admin())
  AND archived_at IS NULL;

REVOKE ALL ON public.agents_safe FROM PUBLIC;
REVOKE ALL ON public.agents_safe FROM anon;
GRANT SELECT ON public.agents_safe TO authenticated;
GRANT SELECT ON public.agents_safe TO service_role;

-- active_agents
DROP VIEW IF EXISTS public.active_agents;
CREATE VIEW public.active_agents
WITH (security_invoker = on) AS
SELECT 
  id,
  agent_name,
  display_name,
  hostname,
  status,
  tenant_id,
  last_heartbeat,
  agent_version,
  os_type,
  os_version,
  enrolled_at,
  is_throttled,
  throttled_at,
  throttle_reason,
  is_isolated,
  isolated_at,
  isolation_reason,
  safe_mode_entered_at,
  safe_mode_reason,
  agent_mode,
  agent_state,
  agent_state_reason,
  agent_state_changed_at,
  offline_reason,
  offline_detected_at,
  archived_at,
  archived_reason,
  payload_hash,
  force_update_version,
  force_update_reason,
  force_update_at,
  last_forced_update_applied,
  ed25519_supported,
  signature_mode,
  result_public_key,
  result_key_fingerprint,
  result_key_registered_at,
  last_block_sync_at,
  poll_interval_seconds,
  agent_version_code,
  force_update_override_safe_mode,
  force_update_override_safe_mode_expires_at,
  requires_revalidation,
  revalidation_reason,
  revalidation_required_at
FROM public.agents
WHERE archived_at IS NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

REVOKE ALL ON public.active_agents FROM PUBLIC;
REVOKE ALL ON public.active_agents FROM anon;
GRANT SELECT ON public.active_agents TO authenticated;
GRANT SELECT ON public.active_agents TO service_role;

-- agent_releases_public
DROP VIEW IF EXISTS public.agent_releases_public;
CREATE VIEW public.agent_releases_public
WITH (security_invoker = on) AS
SELECT 
  id,
  version,
  platform,
  channel,
  sha256,
  release_notes,
  is_active,
  created_at
FROM public.agent_releases
WHERE is_active = true
  AND (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()) OR is_current_super_admin());

REVOKE ALL ON public.agent_releases_public FROM PUBLIC;
REVOKE ALL ON public.agent_releases_public FROM anon;
GRANT SELECT ON public.agent_releases_public TO authenticated;
GRANT SELECT ON public.agent_releases_public TO service_role;

-- enrollment_keys_safe
DROP VIEW IF EXISTS public.enrollment_keys_safe;
CREATE VIEW public.enrollment_keys_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  tenant_id,
  key,
  description,
  max_uses,
  current_uses,
  is_active,
  created_at,
  expires_at,
  created_by
FROM public.enrollment_keys
WHERE tenant_id = get_active_tenant_id() OR is_current_super_admin();

REVOKE ALL ON public.enrollment_keys_safe FROM PUBLIC;
REVOKE ALL ON public.enrollment_keys_safe FROM anon;
GRANT SELECT ON public.enrollment_keys_safe TO authenticated;
GRANT SELECT ON public.enrollment_keys_safe TO service_role;

-- invites_safe
DROP VIEW IF EXISTS public.invites_safe;
CREATE VIEW public.invites_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  tenant_id,
  email,
  role,
  status,
  invited_by,
  created_at,
  expires_at,
  accepted_at
FROM public.invites
WHERE tenant_id = get_active_tenant_id() OR is_current_super_admin();

REVOKE ALL ON public.invites_safe FROM PUBLIC;
REVOKE ALL ON public.invites_safe FROM anon;
GRANT SELECT ON public.invites_safe TO authenticated;
GRANT SELECT ON public.invites_safe TO service_role;

-- Add documentation comments
COMMENT ON VIEW public.profiles_public IS 'Security: Requires authenticated. Uses security_invoker + tenant isolation via user_roles.';
COMMENT ON VIEW public.agents_public IS 'Security: Requires authenticated. Uses security_invoker + tenant isolation.';
COMMENT ON VIEW public.agents_safe IS 'Security: Requires authenticated. Uses security_invoker + tenant isolation.';
COMMENT ON VIEW public.active_agents IS 'Security: Requires authenticated. Uses security_invoker + tenant isolation.';
COMMENT ON VIEW public.agent_releases_public IS 'Security: Requires authenticated user with role. Active releases only.';
COMMENT ON VIEW public.enrollment_keys_safe IS 'Security: Requires authenticated. Uses security_invoker + tenant isolation.';
COMMENT ON VIEW public.invites_safe IS 'Security: Requires authenticated. Uses security_invoker + tenant isolation.';