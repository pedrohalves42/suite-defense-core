
-- Tabela de evidências SOC 2
CREATE TABLE public.soc2_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  control_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('code', 'test', 'policy', 'log', 'config', 'database', 'infrastructure')),
  reference TEXT NOT NULL,
  description TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  hash TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'superseded')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_soc2_evidence_control ON public.soc2_evidence(tenant_id, control_id);
CREATE INDEX idx_soc2_evidence_status ON public.soc2_evidence(tenant_id, status);
CREATE INDEX idx_soc2_evidence_collected ON public.soc2_evidence(tenant_id, collected_at DESC);

-- RLS
ALTER TABLE public.soc2_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for soc2_evidence"
ON public.soc2_evidence FOR SELECT TO authenticated
USING (tenant_id = public.get_active_tenant_id());

CREATE POLICY "Admin/compliance can insert soc2_evidence"
ON public.soc2_evidence FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_active_tenant_id());

CREATE POLICY "Admin/compliance can update soc2_evidence"
ON public.soc2_evidence FOR UPDATE TO authenticated
USING (tenant_id = public.get_active_tenant_id());

CREATE POLICY "Admin/compliance can delete soc2_evidence"
ON public.soc2_evidence FOR DELETE TO authenticated
USING (tenant_id = public.get_active_tenant_id());

-- Tabela de histórico de preenchimento
CREATE TABLE public.soc2_control_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  control_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'implemented', 'verified', 'not_applicable')),
  notes TEXT,
  filled_by UUID,
  auto_filled BOOLEAN DEFAULT false,
  filled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_soc2_control_status_control ON public.soc2_control_status(tenant_id, control_id);
CREATE INDEX idx_soc2_control_status_filled ON public.soc2_control_status(tenant_id, filled_at DESC);

-- RLS
ALTER TABLE public.soc2_control_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for soc2_control_status"
ON public.soc2_control_status FOR SELECT TO authenticated
USING (tenant_id = public.get_active_tenant_id());

CREATE POLICY "Admin/compliance can insert soc2_control_status"
ON public.soc2_control_status FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_active_tenant_id());

CREATE POLICY "Admin/compliance can update soc2_control_status"
ON public.soc2_control_status FOR UPDATE TO authenticated
USING (tenant_id = public.get_active_tenant_id());

-- Trigger updated_at para soc2_evidence
CREATE TRIGGER update_soc2_evidence_updated_at
BEFORE UPDATE ON public.soc2_evidence
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
