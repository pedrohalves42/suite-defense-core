-- Create poe_chain_breaks table for POE Chain Integrity tracking
CREATE TABLE IF NOT EXISTS public.poe_chain_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  break_type TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_poe_chain_breaks_agent ON public.poe_chain_breaks(agent_id);
CREATE INDEX IF NOT EXISTS idx_poe_chain_breaks_tenant ON public.poe_chain_breaks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_poe_chain_breaks_detected ON public.poe_chain_breaks(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_poe_chain_breaks_unresolved ON public.poe_chain_breaks(tenant_id, resolved_at) 
  WHERE resolved_at IS NULL;

-- Enable RLS
ALTER TABLE public.poe_chain_breaks ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can view chain breaks from their tenant
DROP POLICY IF EXISTS "Admins can view tenant chain breaks" ON public.poe_chain_breaks;
CREATE POLICY "Admins can view tenant chain breaks" ON public.poe_chain_breaks
  FOR SELECT USING (
    tenant_id IN (
      SELECT ur.tenant_id FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
    )
  );

-- RLS: Admins can resolve chain breaks
DROP POLICY IF EXISTS "Admins can update tenant chain breaks" ON public.poe_chain_breaks;
CREATE POLICY "Admins can update tenant chain breaks" ON public.poe_chain_breaks
  FOR UPDATE USING (
    tenant_id IN (
      SELECT ur.tenant_id FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
    )
  );