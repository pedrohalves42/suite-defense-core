-- Create table for blocked websites (quick sync with agents)
CREATE TABLE IF NOT EXISTS blocked_websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain_pattern TEXT NOT NULL,
  reason TEXT,
  blocked_by UUID REFERENCES profiles(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, domain_pattern)
);

-- Enable RLS on blocked_websites
ALTER TABLE blocked_websites ENABLE ROW LEVEL SECURITY;

-- RLS policies for blocked_websites
CREATE POLICY "Users can view blocked websites in their tenant"
ON blocked_websites FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM user_roles 
  WHERE user_id = auth.uid() 
  AND role IN ('admin', 'operator', 'viewer', 'super_admin')
));

CREATE POLICY "Admins can manage blocked websites in their tenant"
ON blocked_websites FOR ALL
USING (tenant_id IN (
  SELECT tenant_id FROM user_roles 
  WHERE user_id = auth.uid() 
  AND role IN ('admin', 'super_admin')
))
WITH CHECK (tenant_id IN (
  SELECT tenant_id FROM user_roles 
  WHERE user_id = auth.uid() 
  AND role IN ('admin', 'super_admin')
));

-- Create trigger for updated_at
CREATE TRIGGER update_blocked_websites_updated_at
  BEFORE UPDATE ON blocked_websites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();