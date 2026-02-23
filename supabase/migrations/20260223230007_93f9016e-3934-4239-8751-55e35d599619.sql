
-- ============================================================
-- ADR-040: Software Protection Mode (Observação / Alerta / Bloqueio)
-- Per-tenant configuration for software inventory enforcement
-- ============================================================

CREATE TABLE public.tenant_software_policy (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'observation' CHECK (mode IN ('observation', 'alert', 'block')),
  block_risk_levels TEXT[] NOT NULL DEFAULT '{critical,high}',
  alert_on_new_software BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE(tenant_id)
);

-- Enable RLS
ALTER TABLE public.tenant_software_policy ENABLE ROW LEVEL SECURITY;

-- Policies: tenant members can read, admins can update
CREATE POLICY "Tenant members can view software policy"
  ON public.tenant_software_policy FOR SELECT
  USING (tenant_id = get_active_tenant_id());

CREATE POLICY "Admins can update software policy"
  ON public.tenant_software_policy FOR UPDATE
  USING (tenant_id = get_active_tenant_id());

CREATE POLICY "Admins can insert software policy"
  ON public.tenant_software_policy FOR INSERT
  WITH CHECK (tenant_id = get_active_tenant_id());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.tenant_software_policy TO authenticated;

-- Auto-create policy for existing tenants
INSERT INTO public.tenant_software_policy (tenant_id, mode)
SELECT id, 'observation' FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- Trigger to auto-create policy for new tenants
CREATE OR REPLACE FUNCTION public.create_default_software_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tenant_software_policy (tenant_id, mode)
  VALUES (NEW.id, 'observation')
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_default_software_policy
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_software_policy();
