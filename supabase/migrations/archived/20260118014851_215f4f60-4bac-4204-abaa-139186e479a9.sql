-- ADR-026 Addendum #2: Expand agents_safe view to include all non-sensitive columns
-- The view was missing fields needed by frontend components

-- Drop and recreate the view with all non-sensitive columns
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
  -- Excluded: hmac_secret (SENSITIVE - ADR-026)
  -- Excluded: payload_hash (internal use only)
FROM public.agents;

COMMENT ON VIEW public.agents_safe IS 'ADR-026: Safe view excluding hmac_secret. All frontend queries must use this view.';