-- Dr. Vellum Regression Fix: active_agents view missing columns
-- Must DROP and recreate because column order changed

DROP VIEW IF EXISTS public.active_agents CASCADE;

CREATE VIEW public.active_agents
WITH (security_invoker = on) AS
SELECT 
  -- Original columns (same order):
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
  -- NEW: Missing columns that caused regression:
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
  -- Operational columns:
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
  revalidation_required_at,
  hmac_secret
FROM public.agents
WHERE archived_at IS NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());