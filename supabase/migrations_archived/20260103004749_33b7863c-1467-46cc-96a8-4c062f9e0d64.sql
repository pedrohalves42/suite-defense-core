-- =====================================================
-- CICLO 5: Tabela de ADRs (Architecture Decision Records)
-- =====================================================

CREATE TABLE IF NOT EXISTS governance_adrs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  adr_code TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'accepted' CHECK (status IN ('proposed', 'accepted', 'superseded', 'deprecated')),
  decision TEXT NOT NULL,
  rationale TEXT,
  consequences TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, adr_code)
);

-- Enable RLS
ALTER TABLE governance_adrs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view ADRs for their tenant" 
ON governance_adrs FOR SELECT 
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage ADRs for their tenant" 
ON governance_adrs FOR ALL 
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  )
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_governance_adrs_tenant_status ON governance_adrs(tenant_id, status);