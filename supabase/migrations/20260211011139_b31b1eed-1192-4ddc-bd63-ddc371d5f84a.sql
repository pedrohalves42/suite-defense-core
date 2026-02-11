
-- =====================================================
-- v6.1.1: Harden views with security_barrier
-- =====================================================

-- FIX 1: Recreate agents_public with security_barrier
DROP VIEW IF EXISTS agents_public CASCADE;
CREATE VIEW agents_public WITH (security_invoker = on, security_barrier = true) AS
SELECT 
  id, tenant_id, agent_name, hostname, status, os_type, os_version,
  agent_version, display_name, enrolled_at, last_heartbeat,
  agent_mode, agent_state, agent_state_reason, agent_state_changed_at
FROM agents
WHERE auth.uid() IS NOT NULL
  AND archived_at IS NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- FIX 2: Recreate invites_safe with security_barrier
DROP VIEW IF EXISTS invites_safe CASCADE;
CREATE VIEW invites_safe WITH (security_invoker = on, security_barrier = true) AS
SELECT 
  id, tenant_id, email, role, status, invited_by, created_at, expires_at, accepted_at
FROM invites
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- FIX 3: Recreate profiles_public with security_barrier
DROP VIEW IF EXISTS profiles_public CASCADE;
CREATE VIEW profiles_public WITH (security_invoker = on, security_barrier = true) AS
SELECT 
  id, user_id, username, full_name, created_at, updated_at
FROM profiles p
WHERE auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p.user_id
      AND (ur.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  );

-- FIX 4: Recreate jobs_normalized with auth check + security_barrier
DROP VIEW IF EXISTS jobs_normalized CASCADE;
CREATE VIEW jobs_normalized WITH (security_invoker = on, security_barrier = true) AS
SELECT 
  id, tenant_id, agent_id, agent_name, type, status,
  status AS normalized_status, priority,
  created_at, delivered_at, completed_at, error_message, payload_hash,
  CASE WHEN output IS NOT NULL THEN true ELSE false END AS is_v3,
  output,
  (EXTRACT(epoch FROM (completed_at - delivered_at)))::integer AS duration_seconds,
  EXTRACT(epoch FROM (delivered_at - created_at)) AS queue_time_seconds,
  execution_time_seconds
FROM jobs
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- Revoke direct anonymous access to these views
REVOKE ALL ON agents_public FROM anon;
REVOKE ALL ON invites_safe FROM anon;
REVOKE ALL ON profiles_public FROM anon;
REVOKE ALL ON jobs_normalized FROM anon;

-- Grant only to authenticated
GRANT SELECT ON agents_public TO authenticated;
GRANT SELECT ON invites_safe TO authenticated;
GRANT SELECT ON profiles_public TO authenticated;
GRANT SELECT ON jobs_normalized TO authenticated;
