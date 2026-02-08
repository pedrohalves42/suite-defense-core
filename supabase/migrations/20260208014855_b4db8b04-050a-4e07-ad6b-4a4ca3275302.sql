-- ============================================================
-- SECURITY HARDENING MIGRATION - SSA-SEC-004 (Part 3)
-- Fix remaining access issues
-- ============================================================

-- Revoke anon access from enrollment_keys
REVOKE ALL ON enrollment_keys FROM anon;

-- Verify agents_safe has proper auth check - recreate with explicit auth.uid()
DROP VIEW IF EXISTS agents_safe;
CREATE VIEW agents_safe 
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
FROM agents
WHERE 
  archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (
    tenant_id = get_active_tenant_id()
    OR (
      get_active_tenant_id() IS NULL 
      AND EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid() 
          AND ur.tenant_id = agents.tenant_id
      )
    )
    OR is_current_super_admin()
  );

GRANT SELECT ON agents_safe TO authenticated;

-- Document the service_role warnings as intentional
-- These are for backend Edge Functions only

COMMENT ON POLICY "Service role can create builds" ON agent_builds IS 
'SSA-SEC-004-EXCEPTION: service_role policy for Edge Function automation.
JUSTIFICATION: Build creation must be triggered by backend without user context.
RISK MITIGATION: Only accessible via service_role key which is never exposed to frontend.';

COMMENT ON POLICY "Service role can update builds" ON agent_builds IS 
'SSA-SEC-004-EXCEPTION: service_role policy for Edge Function automation.
JUSTIFICATION: Build status updates are triggered by GitHub Actions callback.
RISK MITIGATION: Only accessible via service_role key.';

COMMENT ON POLICY "Only service role can insert disk metrics" ON agent_disk_metrics IS 
'SSA-SEC-004-EXCEPTION: service_role policy for agent telemetry.
JUSTIFICATION: Agents submit metrics via Edge Functions with service_role.
RISK MITIGATION: Agents authenticate via HMAC, Edge Function validates before insert.';