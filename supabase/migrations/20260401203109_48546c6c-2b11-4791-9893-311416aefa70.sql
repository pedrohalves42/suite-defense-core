-- Enable RLS on the partition
ALTER TABLE public.agent_system_metrics_2026_05 ENABLE ROW LEVEL SECURITY;

-- Apply tenant isolation policy with proper UUID cast
CREATE POLICY "tenant_isolation_select" ON public.agent_system_metrics_2026_05
  FOR SELECT USING (tenant_id = ((auth.jwt() ->> 'tenant_id')::uuid));

CREATE POLICY "service_role_all" ON public.agent_system_metrics_2026_05
  FOR ALL USING (auth.role() = 'service_role');
