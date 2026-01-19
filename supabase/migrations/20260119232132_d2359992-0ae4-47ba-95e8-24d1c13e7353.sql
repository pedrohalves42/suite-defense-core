-- ============================================================
-- ADR-VELLUM: Complete Audit Remediation
-- Fixes: V-001 (CRITICAL), V-002, V-003, V-004, V-007
-- ============================================================

-- V-001 (CRITICAL): Remove vulnerable duplicate function
-- This version lacks tenant validation, enabling cross-tenant escalation
DROP FUNCTION IF EXISTS public.revive_agent_on_reenroll(uuid, text);

-- V-002 (HIGH): Prevent unauthorized super_admin escalation
CREATE OR REPLACE FUNCTION public.prevent_super_admin_self_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Block INSERT of super_admin by non-super_admin
  IF NEW.role = 'super_admin' AND NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'PRIVILEGE_ESCALATION: Only super_admin can assign super_admin role'
      USING ERRCODE = '42501';
  END IF;
  
  -- Block UPDATE to super_admin by non-super_admin
  IF TG_OP = 'UPDATE' AND NEW.role = 'super_admin' 
     AND OLD.role != 'super_admin' AND NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'PRIVILEGE_ESCALATION: Only super_admin can modify roles to super_admin'
      USING ERRCODE = '42501';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

DROP TRIGGER IF EXISTS guard_super_admin_role ON public.user_roles;
CREATE TRIGGER guard_super_admin_role
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION prevent_super_admin_self_assignment();

-- V-004 (HIGH): Recreate agents_safe view with explicit tenant filter
DROP VIEW IF EXISTS public.agents_safe;

CREATE VIEW public.agents_safe WITH (security_invoker=on) AS
SELECT 
  id, tenant_id, agent_name, hostname, status,
  os_type, os_version, agent_version, agent_version_code,
  display_name, enrolled_at, last_heartbeat, last_block_sync_at,
  poll_interval_seconds, agent_mode, agent_state, agent_state_reason,
  agent_state_changed_at, safe_mode_reason, safe_mode_entered_at,
  is_throttled, throttled_at, throttle_reason,
  is_isolated, isolated_at, isolation_reason,
  archived_at, archived_reason,
  force_update_version, force_update_reason, force_update_at,
  force_update_override_safe_mode, force_update_override_safe_mode_expires_at,
  last_forced_update_applied,
  offline_reason, offline_detected_at,
  ed25519_supported, signature_mode,
  result_public_key, result_key_fingerprint, result_key_registered_at,
  requires_revalidation, revalidation_reason, revalidation_required_at
FROM public.agents
WHERE tenant_id = get_active_tenant_id();