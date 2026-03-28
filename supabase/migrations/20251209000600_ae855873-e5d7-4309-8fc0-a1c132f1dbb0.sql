-- Tabela para relatorios agendados
CREATE TABLE public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL DEFAULT 'security_weekly',
  name TEXT NOT NULL DEFAULT 'Relatorio Semanal de Seguranca',
  schedule TEXT NOT NULL DEFAULT 'weekly',
  day_of_week INTEGER DEFAULT 1,
  hour INTEGER DEFAULT 9,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  include_software_inventory BOOLEAN DEFAULT true,
  include_vulnerabilities BOOLEAN DEFAULT true,
  include_web_activity BOOLEAN DEFAULT true,
  include_antivirus BOOLEAN DEFAULT true,
  include_agents_summary BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scheduled reports"
  ON public.scheduled_reports FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  ));

-- Indices
CREATE INDEX idx_scheduled_reports_tenant ON scheduled_reports(tenant_id);
CREATE INDEX idx_scheduled_reports_schedule ON scheduled_reports(is_active, next_send_at);

-- Trigger para updated_at
CREATE TRIGGER update_scheduled_reports_updated_at
  BEFORE UPDATE ON scheduled_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();