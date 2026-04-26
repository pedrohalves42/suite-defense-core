-- ============================================================
-- Create compliance_snapshots table for calculate-compliance Edge Function
-- Stores historical compliance scores per tenant
-- ============================================================

CREATE TABLE IF NOT EXISTS public.compliance_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  grade TEXT NOT NULL,
  category_scores JSONB DEFAULT '[]'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX idx_compliance_snapshots_tenant_calculated 
  ON public.compliance_snapshots (tenant_id, calculated_at DESC);

-- Enable RLS
ALTER TABLE public.compliance_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS: Users see their own tenant's snapshots
CREATE POLICY "Users can view own tenant compliance snapshots"
  ON public.compliance_snapshots
  FOR SELECT
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- RLS: Service role can insert (Edge Functions)
CREATE POLICY "Service role can insert compliance snapshots"
  ON public.compliance_snapshots
  FOR INSERT
  WITH CHECK (true);

-- Comment for audit transparency (V-103)
COMMENT ON TABLE public.compliance_snapshots IS 
  'Historical compliance scores per tenant. INSERT via service_role from calculate-compliance Edge Function. SELECT scoped by tenant RLS.';