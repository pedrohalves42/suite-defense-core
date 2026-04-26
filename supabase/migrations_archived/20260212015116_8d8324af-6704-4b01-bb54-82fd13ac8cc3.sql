
-- =============================================================================
-- SSA-SEC-007: Remediate V-301, V-302, V-307
-- =============================================================================

-- V-301: enrollment_keys - Migrate SELECT from {public} to {authenticated}
DROP POLICY IF EXISTS "enrollment_keys_select_admin_only" ON public.enrollment_keys;

CREATE POLICY "enrollment_keys_select_admin_only"
ON public.enrollment_keys
FOR SELECT TO authenticated
USING (
  is_current_super_admin() OR (
    (tenant_id = get_active_tenant_id()) AND (EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'::app_role
        AND ur.tenant_id = get_active_tenant_id()
    ))
  )
);

-- V-302: tenant_subscriptions - Migrate SELECT from {public} to {authenticated}
DROP POLICY IF EXISTS "tenant_subscriptions_select_active_tenant" ON public.tenant_subscriptions;

CREATE POLICY "tenant_subscriptions_select_active_tenant"
ON public.tenant_subscriptions
FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);

-- V-307: Performance indexes
CREATE INDEX IF NOT EXISTS idx_security_logs_attack_created 
ON public.security_logs(attack_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_user 
ON public.user_roles(tenant_id, user_id, role);
