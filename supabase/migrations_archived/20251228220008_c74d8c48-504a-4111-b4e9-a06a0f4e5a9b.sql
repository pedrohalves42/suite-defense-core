-- =====================================================
-- MIGRACAO: Corrigir RLS para Multi-Tenant
-- Substituir current_user_tenant_id() por checagem IN
-- =====================================================

-- Funcao auxiliar para verificar se usuario pertence a um tenant
CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
  )
$$;

-- =====================================================
-- AGENTS - Atualizar politicas para multi-tenant
-- =====================================================

-- Remover politicas antigas que usam current_user_tenant_id()
DROP POLICY IF EXISTS "Admins and operators can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Users can view agents in their tenant" ON public.agents;
DROP POLICY IF EXISTS "Admins can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Operators can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Viewers can read agents" ON public.agents;

-- Criar novas politicas usando user_belongs_to_tenant()
CREATE POLICY "Users can view agents in their tenants"
ON public.agents
FOR SELECT
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Admins and operators can insert agents"
ON public.agents
FOR INSERT
TO authenticated
WITH CHECK (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Admins and operators can update agents"
ON public.agents
FOR UPDATE
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Admins can delete agents"
ON public.agents
FOR DELETE
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id) AND public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- JOBS - Atualizar politicas para multi-tenant
-- =====================================================

DROP POLICY IF EXISTS "Admins and operators can manage jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can view jobs in their tenant" ON public.jobs;
DROP POLICY IF EXISTS "Admins can manage jobs" ON public.jobs;
DROP POLICY IF EXISTS "Operators can manage jobs" ON public.jobs;
DROP POLICY IF EXISTS "Viewers can read jobs" ON public.jobs;

CREATE POLICY "Users can view jobs in their tenants"
ON public.jobs
FOR SELECT
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Admins and operators can insert jobs"
ON public.jobs
FOR INSERT
TO authenticated
WITH CHECK (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Admins and operators can update jobs"
ON public.jobs
FOR UPDATE
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Admins can delete jobs"
ON public.jobs
FOR DELETE
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id) AND public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- REPORTS - Atualizar politicas para multi-tenant
-- =====================================================

DROP POLICY IF EXISTS "Users can view reports in their tenant" ON public.reports;
DROP POLICY IF EXISTS "Admins can manage reports" ON public.reports;

CREATE POLICY "Users can view reports in their tenants"
ON public.reports
FOR SELECT
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Admins and operators can manage reports"
ON public.reports
FOR ALL
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));

-- =====================================================
-- VIRUS_SCANS - Atualizar politicas para multi-tenant
-- =====================================================

DROP POLICY IF EXISTS "Users can view virus_scans in their tenant" ON public.virus_scans;
DROP POLICY IF EXISTS "Admins can manage virus_scans" ON public.virus_scans;

CREATE POLICY "Users can view virus_scans in their tenants"
ON public.virus_scans
FOR SELECT
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Authenticated can insert virus_scans"
ON public.virus_scans
FOR INSERT
TO authenticated
WITH CHECK (public.user_belongs_to_tenant(tenant_id));

-- =====================================================
-- AUDIT_LOGS - Atualizar politicas para multi-tenant
-- =====================================================

DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can view audit_logs in their tenant" ON public.audit_logs;

CREATE POLICY "Admins can read audit logs in their tenants"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id) AND public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- SYSTEM_ALERTS - Atualizar politicas para multi-tenant
-- =====================================================

DROP POLICY IF EXISTS "Users can view alerts in their tenant" ON public.system_alerts;
DROP POLICY IF EXISTS "Admins can manage alerts" ON public.system_alerts;

CREATE POLICY "Users can view alerts in their tenants"
ON public.system_alerts
FOR SELECT
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Users can update alerts in their tenants"
ON public.system_alerts
FOR UPDATE
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));

-- =====================================================
-- AGENT_SYSTEM_METRICS - Atualizar politicas
-- =====================================================

DROP POLICY IF EXISTS "Users can view metrics in their tenant" ON public.agent_system_metrics;

CREATE POLICY "Users can view metrics in their tenants"
ON public.agent_system_metrics
FOR SELECT
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));

-- =====================================================
-- AGENT_SYSTEM_METRICS_PARTITIONED - Atualizar politicas
-- =====================================================

DROP POLICY IF EXISTS "Users can view partitioned metrics in their tenant" ON public.agent_system_metrics_partitioned;

CREATE POLICY "Users can view partitioned metrics in their tenants"
ON public.agent_system_metrics_partitioned
FOR SELECT
TO authenticated
USING (public.user_belongs_to_tenant(tenant_id));