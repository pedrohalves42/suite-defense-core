-- Criar funcao update_updated_at_column se nao existir
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabela para custos de marketing (calculo de CAC)
CREATE TABLE IF NOT EXISTS public.marketing_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'organic',
  spend_cents INTEGER NOT NULL DEFAULT 0,
  leads_generated INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(tenant_id, month, channel)
);

-- Tabela para pipeline de vendas (CRM basico)
CREATE TABLE IF NOT EXISTS public.sales_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead', 'qualified', 'demo', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
  probability INTEGER NOT NULL DEFAULT 10 CHECK (probability >= 0 AND probability <= 100),
  expected_value_cents INTEGER NOT NULL DEFAULT 0,
  expected_devices INTEGER NOT NULL DEFAULT 1,
  expected_close_date DATE,
  source TEXT,
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  converted_tenant_id UUID REFERENCES public.tenants(id)
);

-- Enable RLS
ALTER TABLE public.marketing_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_pipeline ENABLE ROW LEVEL SECURITY;

-- RLS Policies for marketing_costs (super_admin only)
CREATE POLICY "Super admins can manage marketing_costs"
ON public.marketing_costs
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- RLS Policies for sales_pipeline (super_admin only)
CREATE POLICY "Super admins can manage sales_pipeline"
ON public.sales_pipeline
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketing_costs_month ON public.marketing_costs(month);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_stage ON public.sales_pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_tenant ON public.sales_pipeline(tenant_id);

-- Trigger for updated_at
CREATE TRIGGER update_marketing_costs_updated_at
  BEFORE UPDATE ON public.marketing_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sales_pipeline_updated_at
  BEFORE UPDATE ON public.sales_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();