-- Tabela para rastrear execucoes de relatorios agendados
CREATE TABLE public.report_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scheduled_report_id UUID REFERENCES public.scheduled_reports(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  recipients JSONB DEFAULT '[]',
  file_path TEXT,
  file_size_bytes BIGINT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices para performance
CREATE INDEX idx_report_executions_tenant_id ON public.report_executions(tenant_id);
CREATE INDEX idx_report_executions_scheduled_report_id ON public.report_executions(scheduled_report_id);
CREATE INDEX idx_report_executions_created_at ON public.report_executions(created_at DESC);
CREATE INDEX idx_report_executions_status ON public.report_executions(status);

-- Habilitar RLS
ALTER TABLE public.report_executions ENABLE ROW LEVEL SECURITY;

-- Politicas RLS usando funcao multi-tenant existente
CREATE POLICY "report_executions_select_multitenant" ON public.report_executions
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "report_executions_insert_multitenant" ON public.report_executions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_tenant_access(tenant_id));

CREATE POLICY "report_executions_update_multitenant" ON public.report_executions
  FOR UPDATE TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "report_executions_delete_multitenant" ON public.report_executions
  FOR DELETE TO authenticated
  USING (public.user_has_tenant_access(tenant_id));