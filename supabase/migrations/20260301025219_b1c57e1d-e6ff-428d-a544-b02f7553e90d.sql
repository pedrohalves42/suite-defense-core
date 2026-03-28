
-- =============================================================================
-- FASE 2: V-304 + V-305 ? Views com security_barrier e remocao de crypto cols
-- =============================================================================

-- Drop and recreate all 5 views with security_barrier=true, security_invoker=on
-- V-305: Remove result_public_key, result_key_fingerprint, result_key_registered_at, payload_hash from safe views

-- 1. active_agents (V-304 + V-305: remove crypto cols)
DROP VIEW IF EXISTS public.active_agents CASCADE;
CREATE VIEW public.active_agents
WITH (security_barrier=true, security_invoker=on) AS
SELECT id,
    agent_name, display_name, hostname, status, tenant_id,
    last_heartbeat, agent_version, os_type, os_version, enrolled_at,
    is_throttled, throttled_at, throttle_reason,
    is_isolated, isolated_at, isolation_reason,
    safe_mode_entered_at, safe_mode_reason,
    agent_mode, agent_state, agent_state_reason, agent_state_changed_at,
    offline_reason, offline_detected_at,
    archived_at, archived_reason,
    force_update_version, force_update_reason, force_update_at,
    last_forced_update_applied,
    ed25519_supported, signature_mode,
    last_block_sync_at, poll_interval_seconds, agent_version_code,
    force_update_override_safe_mode, force_update_override_safe_mode_expires_at,
    requires_revalidation, revalidation_reason, revalidation_required_at
FROM agents
WHERE auth.uid() IS NOT NULL
  AND archived_at IS NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 2. agents_public (V-304 only ? already clean of crypto cols)
DROP VIEW IF EXISTS public.agents_public CASCADE;
CREATE VIEW public.agents_public
WITH (security_barrier=true, security_invoker=on) AS
SELECT id, tenant_id, agent_name, hostname, status,
    os_type, os_version, agent_version, display_name,
    enrolled_at, last_heartbeat, agent_mode,
    agent_state, agent_state_reason, agent_state_changed_at
FROM agents
WHERE auth.uid() IS NOT NULL
  AND archived_at IS NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 3. agents_safe (V-304 + V-305: remove result_public_key, result_key_fingerprint, result_key_registered_at)
DROP VIEW IF EXISTS public.agents_safe CASCADE;
CREATE VIEW public.agents_safe
WITH (security_barrier=true, security_invoker=on) AS
SELECT id, tenant_id, agent_name, hostname, status,
    os_type, os_version, agent_version, agent_version_code,
    display_name, enrolled_at, last_heartbeat, last_block_sync_at,
    poll_interval_seconds, agent_mode,
    agent_state, agent_state_reason, agent_state_changed_at,
    safe_mode_reason, safe_mode_entered_at,
    is_throttled, throttled_at, throttle_reason,
    is_isolated, isolated_at, isolation_reason,
    archived_at, archived_reason,
    force_update_version, force_update_reason, force_update_at,
    force_update_override_safe_mode, force_update_override_safe_mode_expires_at,
    last_forced_update_applied,
    offline_reason, offline_detected_at,
    ed25519_supported, signature_mode,
    requires_revalidation, revalidation_reason, revalidation_required_at
FROM agents
WHERE auth.uid() IS NOT NULL
  AND archived_at IS NULL
  AND (tenant_id = get_active_tenant_id()
       OR (get_active_tenant_id() IS NULL AND EXISTS (
           SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = agents.tenant_id
       ))
       OR is_current_super_admin());

-- 4. enrollment_keys_safe (V-304 only)
DROP VIEW IF EXISTS public.enrollment_keys_safe CASCADE;
CREATE VIEW public.enrollment_keys_safe
WITH (security_barrier=true, security_invoker=on) AS
SELECT id, tenant_id,
    CASE
        WHEN key IS NOT NULL AND length(key) > 8
        THEN substring(key FROM 1 FOR 4) || '-****-' || substring(key FROM length(key) - 3 FOR 4)
        ELSE '****'
    END AS key_masked,
    description, max_uses, current_uses, is_active,
    created_at, expires_at, created_by, used_at, agent_id, used_by_agent
FROM enrollment_keys
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 5. invites_safe (V-304 only)
DROP VIEW IF EXISTS public.invites_safe CASCADE;
CREATE VIEW public.invites_safe
WITH (security_barrier=true, security_invoker=on) AS
SELECT id, tenant_id, email, role, status,
    invited_by, created_at, expires_at, accepted_at
FROM invites
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());
