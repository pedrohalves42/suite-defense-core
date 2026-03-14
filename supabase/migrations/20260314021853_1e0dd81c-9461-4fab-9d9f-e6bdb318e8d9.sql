-- V-12001/V-12002/V-12003: Harden views per V-801 standard
-- Remove is_current_super_admin() bypass from all views
-- Add auth.uid() IS NOT NULL to enrollment_keys_safe
-- Remove NULL fallback from agents_safe that exposes multi-tenant data

-- 1. agents_public: Remove super_admin bypass
CREATE OR REPLACE VIEW public.agents_public
WITH (security_invoker = on, security_barrier = true)
AS
SELECT 
  id, tenant_id, agent_name, hostname, status, os_type, os_version,
  agent_version, display_name, enrolled_at, last_heartbeat, agent_mode,
  agent_state, agent_state_reason, agent_state_changed_at
FROM agents
WHERE auth.uid() IS NOT NULL 
  AND archived_at IS NULL 
  AND tenant_id = get_active_tenant_id();

-- 2. agents_safe: Remove super_admin bypass AND NULL fallback
CREATE OR REPLACE VIEW public.agents_safe
WITH (security_invoker = on, security_barrier = true)
AS
SELECT 
  id, tenant_id, agent_name, hostname, status, os_type, os_version,
  agent_version, agent_version_code, display_name, enrolled_at, last_heartbeat,
  last_block_sync_at, poll_interval_seconds, agent_mode, agent_state,
  agent_state_reason, agent_state_changed_at, safe_mode_reason,
  safe_mode_entered_at, is_throttled, throttled_at, throttle_reason,
  is_isolated, isolated_at, isolation_reason, archived_at, archived_reason,
  force_update_version, force_update_reason, force_update_at,
  force_update_override_safe_mode, force_update_override_safe_mode_expires_at,
  last_forced_update_applied, offline_reason, offline_detected_at,
  ed25519_supported, signature_mode, requires_revalidation,
  revalidation_reason, revalidation_required_at
FROM agents
WHERE auth.uid() IS NOT NULL 
  AND archived_at IS NULL 
  AND tenant_id = get_active_tenant_id();

-- 3. invites_safe: Remove super_admin bypass
CREATE OR REPLACE VIEW public.invites_safe
WITH (security_invoker = on, security_barrier = true)
AS
SELECT 
  id, tenant_id, email, role, status, invited_by, created_at,
  expires_at, accepted_at
FROM invites
WHERE auth.uid() IS NOT NULL 
  AND tenant_id = get_active_tenant_id();

-- 4. enrollment_keys_safe: Add auth.uid() check, remove super_admin bypass
CREATE OR REPLACE VIEW public.enrollment_keys_safe
WITH (security_invoker = on, security_barrier = true)
AS
SELECT 
  id, tenant_id,
  (left(key, 8) || '****') AS key_masked,
  description, max_uses, current_uses, is_active, created_at,
  expires_at, created_by, used_at, agent_id, used_by_agent
FROM enrollment_keys
WHERE auth.uid() IS NOT NULL 
  AND tenant_id = get_active_tenant_id();