-- =============================================
-- V4 Final Adjustments: subscription_events + plan flags
-- =============================================

-- 1. Add visibility flags to subscription_plans
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS is_sales_only boolean DEFAULT false;

-- Mark Scale as internal-only (for sales team)
UPDATE subscription_plans 
SET is_public = false, is_sales_only = true 
WHERE name = 'scale';

-- Ensure V4 plans are public
UPDATE subscription_plans 
SET is_public = true, is_sales_only = false 
WHERE name IN ('starter_compliance', 'business');

-- 2. Create subscription_events table for audit trail
CREATE TABLE IF NOT EXISTS subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- upgrade, downgrade_scheduled, addon_added, canceled, migrated_from_legacy
  old_plan text,
  new_plan text,
  old_devices int,
  new_devices int,
  addon_quantity int,
  effective_at timestamptz,
  stripe_event_id text,
  stripe_subscription_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_subscription_events_tenant 
  ON subscription_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type 
  ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created 
  ON subscription_events(created_at DESC);

-- Enable RLS
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view events for their tenant
CREATE POLICY "tenant_view_events" ON subscription_events 
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- Policy: Only system can insert events (via service role)
CREATE POLICY "system_insert_events" ON subscription_events 
  FOR INSERT WITH CHECK (true);

-- 3. Add comment for documentation
COMMENT ON TABLE subscription_events IS 'Audit trail for all subscription changes including upgrades, downgrades, addon purchases, and cancellations';
COMMENT ON COLUMN subscription_events.event_type IS 'Types: upgrade, downgrade_scheduled, downgrade_executed, addon_added, addon_removed, canceled, reactivated, migrated_from_legacy';
COMMENT ON COLUMN subscription_events.effective_at IS 'When the change takes effect (for scheduled changes like downgrades)';