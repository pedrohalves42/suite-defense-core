-- Create generated_reports table for automatic report generation
CREATE TABLE IF NOT EXISTS public.generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_name TEXT,
  report_type TEXT NOT NULL CHECK (report_type IN ('full_security', 'software_inventory', 'vulnerabilities', 'antivirus', 'web_activity')),
  title TEXT NOT NULL,
  risk_score INTEGER,
  risk_level TEXT,
  statistics JSONB DEFAULT '{}'::jsonb,
  report_data JSONB DEFAULT '{}'::jsonb,
  file_path TEXT,
  file_url TEXT,
  status TEXT DEFAULT 'generated' CHECK (status IN ('generating', 'generated', 'failed')),
  triggered_by TEXT DEFAULT 'manual' CHECK (triggered_by IN ('job_completion', 'scheduled', 'manual')),
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days'
);

-- Enable RLS
ALTER TABLE public.generated_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for generated_reports
CREATE POLICY "Users can view their tenant reports"
ON public.generated_reports FOR SELECT
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert reports for their tenant"
ON public.generated_reports FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their tenant reports"
ON public.generated_reports FOR DELETE
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_generated_reports_tenant_id ON public.generated_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_created_at ON public.generated_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_reports_agent_id ON public.generated_reports(agent_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_report_type ON public.generated_reports(report_type);