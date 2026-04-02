-- =============================================================================
-- FIX 1: hmac_agent_secrets — Enable security_invoker so RLS on agents applies
-- =============================================================================
DROP VIEW IF EXISTS public.hmac_agent_secrets;
CREATE VIEW public.hmac_agent_secrets
WITH (security_invoker = true)
AS
SELECT 
  id AS agent_id,
  hmac_secret,
  tenant_id
FROM public.agents a
WHERE a.status = 'active'
  AND a.hmac_secret IS NOT NULL;

REVOKE ALL ON public.hmac_agent_secrets FROM anon;
REVOKE ALL ON public.hmac_agent_secrets FROM authenticated;
GRANT SELECT ON public.hmac_agent_secrets TO service_role;

-- =============================================================================
-- FIX 2: Realtime channel authorization — tenant-scoped topics
-- =============================================================================
CREATE POLICY "Enforce tenant-scoped realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  starts_with(
    extension::text,
    get_active_tenant_id()::text
  )
  OR
  current_setting('role', true) = 'service_role'
);

-- =============================================================================
-- FIX 3: update_packages — Remove cross-tenant read access
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can read active packages" ON public.update_packages;

CREATE POLICY "Only super admins can read update packages"
ON public.update_packages
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- =============================================================================
-- FIX 4: tenants — Mask scim_api_key from non-admin members
-- =============================================================================
CREATE OR REPLACE VIEW public.tenants_safe AS
SELECT 
  id, name, slug, owner_user_id, company_name, cnpj, phone,
  contact_email, address, city, state, zip_code,
  setup_completed, auto_action_mode, mfa_policy,
  break_glass_enabled, session_timeout_minutes,
  suspension_status, last_activity_at, industry_segment, tier,
  scim_config, created_at, updated_at
FROM public.tenants;

GRANT SELECT ON public.tenants_safe TO authenticated;

-- Replace broad member policy with admin-only for full details
DROP POLICY IF EXISTS "Users can view tenants they belong to" ON public.tenants;

CREATE POLICY "Admins can view their tenant with full details"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  (id = get_active_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
  OR is_current_super_admin()
);

-- Keep system-level active tenant policy
DROP POLICY IF EXISTS "tenants_select_active_tenant" ON public.tenants;
CREATE POLICY "tenants_select_active_tenant"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  (id = get_active_tenant_id())
  OR is_current_super_admin()
);