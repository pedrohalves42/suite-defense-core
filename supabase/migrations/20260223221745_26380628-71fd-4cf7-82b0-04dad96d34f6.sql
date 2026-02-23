
-- =============================================================================
-- ADR-038: Harden webhook_configs + cleanup agent_web_activity
-- =============================================================================

-- 1. Create safe view for webhook_configs (excludes secret field)
CREATE OR REPLACE VIEW public.webhook_configs_safe
WITH (security_invoker = on, security_barrier = true) AS
SELECT 
  id, tenant_id, name, url, event_types, severity_filter, is_active,
  headers, max_retries, failure_count, last_triggered_at, last_status_code,
  created_at, updated_at, created_by
FROM public.webhook_configs
WHERE (tenant_id = get_active_tenant_id() OR is_current_super_admin());

COMMENT ON VIEW public.webhook_configs_safe IS 
'Safe view excluding webhook secrets. Regular users should query this view. ADR-038.';

-- 2. Drop overly permissive SELECT policy for regular users
DROP POLICY IF EXISTS "Tenants podem ver seus webhooks" ON public.webhook_configs;

-- 3. Add restricted SELECT for admins only (they need to see secrets for config)
CREATE POLICY "webhook_configs_select_admin_only" ON public.webhook_configs
FOR SELECT TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin')
  )
  OR is_current_super_admin()
);

-- 4. Remove duplicate legacy agent_web_activity SELECT policy
DROP POLICY IF EXISTS "tenant_web_activity_select" ON public.agent_web_activity;

-- 5. Fix webhook_configs: the "Service role acesso total" policy incorrectly checks
-- auth.role() = 'service_role' on authenticated role (this never matches)
DROP POLICY IF EXISTS "Service role acesso total webhook_configs" ON public.webhook_configs;
