-- ============================================
-- RLS HARDENING - Migration 3: Secure Views
-- Creates safe views excluding sensitive columns
-- ============================================

-- agents_public - excludes hmac_secret
CREATE OR REPLACE VIEW public.agents_public
WITH (security_invoker = on) AS
SELECT 
  id,
  agent_name,
  enrolled_at,
  last_heartbeat,
  status,
  tenant_id,
  payload_hash,
  os_type,
  os_version,
  hostname,
  agent_version,
  display_name,
  force_update_version,
  force_update_reason,
  force_update_at,
  last_forced_update_applied,
  ed25519_supported,
  signature_mode,
  result_public_key,
  result_key_fingerprint,
  result_key_registered_at,
  agent_mode,
  safe_mode_reason,
  safe_mode_entered_at,
  last_block_sync_at,
  poll_interval_seconds,
  is_throttled,
  throttled_at,
  throttle_reason,
  is_isolated,
  isolated_at,
  isolation_reason,
  agent_version_code,
  force_update_override_safe_mode,
  force_update_override_safe_mode_expires_at,
  agent_state,
  agent_state_reason,
  agent_state_changed_at,
  offline_reason,
  offline_detected_at,
  archived_at,
  archived_reason,
  requires_revalidation,
  revalidation_reason,
  revalidation_required_at
  -- EXCLUDED: hmac_secret (sensitive field)
FROM public.agents;

COMMENT ON VIEW public.agents_public IS 
  'Safe view excluding hmac_secret. Mandatory for frontend SELECT queries. ADR-023.';

-- invites_safe - excludes token
CREATE OR REPLACE VIEW public.invites_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  email,
  role,
  tenant_id,
  invited_by,
  status,
  created_at,
  expires_at,
  accepted_at
  -- EXCLUDED: token (sensitive field)
FROM public.invites;

COMMENT ON VIEW public.invites_safe IS 
  'Safe view excluding invite token. Mandatory for frontend SELECT queries. ADR-023.';