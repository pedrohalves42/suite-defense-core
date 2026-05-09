-- Fix 1: ai_actions RLS — restrict to ACTIVE tenant only (prevents cross-tenant reads/updates
-- for users that belong to multiple tenants).
DROP POLICY IF EXISTS ai_actions_select_tenant_isolation_v2 ON public.ai_actions;
CREATE POLICY ai_actions_select_tenant_isolation_v2
ON public.ai_actions
FOR SELECT
TO authenticated
USING (is_current_super_admin() OR tenant_id = get_active_tenant_id());

DROP POLICY IF EXISTS ai_actions_update_tenant_isolation ON public.ai_actions;
CREATE POLICY ai_actions_update_tenant_isolation
ON public.ai_actions
FOR UPDATE
TO authenticated
USING (
  is_current_super_admin()
  OR (
    tenant_id = get_active_tenant_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  OR (
    tenant_id = get_active_tenant_id()
    AND has_role(auth.uid(), 'super_admin'::app_role)
  )
)
WITH CHECK (
  is_current_super_admin()
  OR (
    tenant_id = get_active_tenant_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  OR (
    tenant_id = get_active_tenant_id()
    AND has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- Fix 2: agent_system_metrics_2026_06 partition policy — must apply to authenticated only and
-- use get_active_tenant_id() (which validates user-membership) instead of raw JWT claim.
DROP POLICY IF EXISTS agent_system_metrics_2026_06_tenant_scoped ON public.agent_system_metrics_2026_06;
CREATE POLICY agent_system_metrics_2026_06_tenant_scoped
ON public.agent_system_metrics_2026_06
FOR ALL
TO authenticated
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin())
WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());