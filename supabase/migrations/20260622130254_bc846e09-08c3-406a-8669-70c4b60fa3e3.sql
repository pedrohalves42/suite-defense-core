-- P0-S1: Enable RLS + tenant policy on missing partition agent_system_metrics_2026_07
ALTER TABLE public.agent_system_metrics_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_system_metrics_2026_07_tenant_scoped
ON public.agent_system_metrics_2026_07
FOR ALL
TO authenticated
USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin())
WITH CHECK ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());