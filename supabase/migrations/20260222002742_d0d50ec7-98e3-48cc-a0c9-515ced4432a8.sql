
-- FIX 1: agents_safe - change from security_invoker=off to security_invoker=on
-- This was flagged as SECURITY DEFINER view by the linter
CREATE OR REPLACE VIEW public.agents_safe
WITH (security_invoker = on, security_barrier = true) AS
SELECT id,
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
    tenant_id = get_active_tenant_id()
    OR (get_active_tenant_id() IS NULL AND EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = agents.tenant_id
    ))
    OR is_current_super_admin()
  );

COMMENT ON VIEW public.agents_safe IS 'SSA-SEC-010: Hardened with security_invoker=on, security_barrier=true, auth.uid() + tenant filter. Fixed from security_invoker=off.';

-- FIX 2: handle_updated_at - set search_path
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
