
-- Fix active_agents view: add explicit auth check per SSA-SEC-005
CREATE OR REPLACE VIEW public.active_agents
WITH (security_invoker = on) AS
SELECT id, agent_name, display_name, hostname, status, tenant_id,
  last_heartbeat, agent_version, os_type, os_version, enrolled_at,
  is_throttled, throttled_at, throttle_reason,
  is_isolated, isolated_at, isolation_reason,
  safe_mode_entered_at, safe_mode_reason,
  agent_mode, agent_state, agent_state_reason, agent_state_changed_at,
  offline_reason, offline_detected_at, archived_at, archived_reason,
  payload_hash, force_update_version, force_update_reason, force_update_at,
  last_forced_update_applied, ed25519_supported, signature_mode,
  result_public_key, result_key_fingerprint, result_key_registered_at,
  last_block_sync_at, poll_interval_seconds, agent_version_code,
  force_update_override_safe_mode, force_update_override_safe_mode_expires_at,
  requires_revalidation, revalidation_reason, revalidation_required_at
FROM agents
WHERE auth.uid() IS NOT NULL
  AND archived_at IS NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- Fix audit_logs_safe view: add explicit auth check per SSA-SEC-005
CREATE OR REPLACE VIEW public.audit_logs_safe
WITH (security_invoker = on) AS
SELECT id, user_id, tenant_id, action, resource_type, resource_id, success, created_at
FROM audit_logs
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());
