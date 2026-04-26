
-- =============================================================================
-- SSA-SEC-006b: Fix remaining security scan findings
-- 1. hmac_agent_secrets view - revoke anon, grant only authenticated
-- 2. security_events - restrict SELECT to authenticated + admin roles
-- =============================================================================

-- 1. hmac_agent_secrets view - restrict access
REVOKE ALL ON public.hmac_agent_secrets FROM anon;
REVOKE ALL ON public.hmac_agent_secrets FROM authenticated;
REVOKE ALL ON public.hmac_agent_secrets FROM public;
-- Only service_role should access HMAC secrets
GRANT SELECT ON public.hmac_agent_secrets TO service_role;

-- 2. security_events - fix SELECT policy from public to authenticated with admin restriction
DROP POLICY IF EXISTS "security_events_select_active_tenant" ON public.security_events;

CREATE POLICY "security_events_select_admin_only"
ON public.security_events
FOR SELECT
TO authenticated
USING (
  (
    get_active_tenant_id() IS NOT NULL 
    AND tenant_id = get_active_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
    )
  )
  OR is_current_super_admin()
);
