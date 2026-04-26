-- =====================================================
-- SSA-SEC-005 Part 2: Fix Views with security_invoker
-- =====================================================
-- Issue: Views are detected as "publicly readable" because they
-- don't have security_invoker=on, which means RLS is bypassed
-- =====================================================

-- 1. agent_releases_public - Add auth check
DROP VIEW IF EXISTS agent_releases_public;
CREATE VIEW agent_releases_public WITH (security_invoker = on) AS
SELECT 
  id,
  version,
  channel,
  platform,
  is_active,
  release_notes,
  created_at
FROM agent_releases
WHERE is_active = true
  AND auth.uid() IS NOT NULL;

COMMENT ON VIEW agent_releases_public IS 
'SSA-SEC-005: Public agent releases view restricted to authenticated users only.';

-- 2. profiles_public - Already has tenant filter, add security_invoker
DROP VIEW IF EXISTS profiles_public;
CREATE VIEW profiles_public WITH (security_invoker = on) AS
SELECT 
  id,
  user_id,
  username,
  full_name,
  created_at,
  updated_at
FROM profiles p
WHERE auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p.user_id 
      AND (ur.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
  );

COMMENT ON VIEW profiles_public IS 
'SSA-SEC-005: Public profiles view with tenant isolation and auth requirement.';

-- 3. agents_public - Already has tenant filter, verify security_invoker
DROP VIEW IF EXISTS agents_public;
CREATE VIEW agents_public WITH (security_invoker = on) AS
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
FROM agents
WHERE auth.uid() IS NOT NULL
  AND archived_at IS NULL
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

COMMENT ON VIEW agents_public IS 
'SSA-SEC-005: Public agents view with tenant isolation and auth requirement.';

-- 4. agents_safe - Already has complex filter, verify security_invoker
DROP VIEW IF EXISTS agents_safe;
CREATE VIEW agents_safe WITH (security_invoker = on) AS
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
FROM agents
WHERE auth.uid() IS NOT NULL
  AND archived_at IS NULL
  AND (
    tenant_id = public.get_active_tenant_id() 
    OR (
      public.get_active_tenant_id() IS NULL 
      AND EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.tenant_id = agents.tenant_id
      )
    )
    OR public.is_current_super_admin()
  );

COMMENT ON VIEW agents_safe IS 
'SSA-SEC-005: Safe agents view excluding hmac_secret with tenant isolation.';

-- 5. invites_safe - Add security_invoker
DROP VIEW IF EXISTS invites_safe;
CREATE VIEW invites_safe WITH (security_invoker = on) AS
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
FROM invites
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

COMMENT ON VIEW invites_safe IS 
'SSA-SEC-005: Safe invites view excluding token with tenant isolation.';

-- 6. enrollment_keys_safe - Add security_invoker
DROP VIEW IF EXISTS enrollment_keys_safe;
CREATE VIEW enrollment_keys_safe WITH (security_invoker = on) AS
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
FROM enrollment_keys
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

COMMENT ON VIEW enrollment_keys_safe IS 
'SSA-SEC-005: Safe enrollment keys view with tenant isolation.';

-- Revoke anon access from all views
REVOKE ALL ON agent_releases_public FROM anon;
REVOKE ALL ON profiles_public FROM anon;
REVOKE ALL ON agents_public FROM anon;
REVOKE ALL ON agents_safe FROM anon;
REVOKE ALL ON invites_safe FROM anon;
REVOKE ALL ON enrollment_keys_safe FROM anon;

-- Grant only to authenticated
GRANT SELECT ON agent_releases_public TO authenticated;
GRANT SELECT ON profiles_public TO authenticated;
GRANT SELECT ON agents_public TO authenticated;
GRANT SELECT ON agents_safe TO authenticated;
GRANT SELECT ON invites_safe TO authenticated;
GRANT SELECT ON enrollment_keys_safe TO authenticated;