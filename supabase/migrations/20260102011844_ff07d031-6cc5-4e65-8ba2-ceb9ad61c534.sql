-- Ensure operational_calendar table exists
CREATE TABLE IF NOT EXISTS operational_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('holiday', 'maintenance', 'expected_offline')),
  title text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  affected_agents text[],
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE operational_calendar ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Tenant members can view calendar" ON operational_calendar;
DROP POLICY IF EXISTS "Admins can manage calendar" ON operational_calendar;

-- Create RLS policies using user_roles table
CREATE POLICY "Tenant members can view calendar"
ON operational_calendar FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage calendar"
ON operational_calendar FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  )
);

CREATE INDEX IF NOT EXISTS idx_operational_calendar_dates ON operational_calendar(tenant_id, start_date, end_date);