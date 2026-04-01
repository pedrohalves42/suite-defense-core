-- Fix agent_quarantine: use get_active_tenant_id()
DROP POLICY IF EXISTS "Tenant isolation for agent_quarantine" ON public.agent_quarantine;
CREATE POLICY "Tenant isolation for agent_quarantine"
  ON public.agent_quarantine
  FOR SELECT
  TO authenticated
  USING (tenant_id = get_active_tenant_id());

-- Fix agent_vulnerabilities: use get_active_tenant_id()
DROP POLICY IF EXISTS "Tenant isolation for agent_vulnerabilities" ON public.agent_vulnerabilities;
CREATE POLICY "Tenant isolation for agent_vulnerabilities"
  ON public.agent_vulnerabilities
  FOR SELECT
  TO authenticated
  USING (tenant_id = get_active_tenant_id());

-- Fix agent_system_metrics_2026_05: use get_active_tenant_id()
DROP POLICY IF EXISTS "tenant_isolation_select" ON public.agent_system_metrics_2026_05;
CREATE POLICY "tenant_isolation_select"
  ON public.agent_system_metrics_2026_05
  FOR SELECT
  TO authenticated
  USING (tenant_id = get_active_tenant_id());