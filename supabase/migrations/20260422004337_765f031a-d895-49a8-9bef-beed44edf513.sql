-- Fix 1: notification_deliveries — substituir leitura de claim JWT por get_active_tenant_id()
DROP POLICY IF EXISTS "Tenant isolation for notification_deliveries" ON public.notification_deliveries;

CREATE POLICY "notification_deliveries_tenant_isolation"
ON public.notification_deliveries
FOR ALL
TO authenticated
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- Fix 2: agent_system_metrics_2026_05 — padronizar TO service_role
DROP POLICY IF EXISTS "service_role_all" ON public.agent_system_metrics_2026_05;

CREATE POLICY "service_role_all"
ON public.agent_system_metrics_2026_05
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix 3: failed_login_attempts — remover block policies PERMISSIVE inertes
DROP POLICY IF EXISTS "Block all modifications to failed_login_attempts_v206" ON public.failed_login_attempts;
DROP POLICY IF EXISTS "Block updates to failed_login_attempts_v206" ON public.failed_login_attempts;
DROP POLICY IF EXISTS "Block deletes to failed_login_attempts_v206" ON public.failed_login_attempts;