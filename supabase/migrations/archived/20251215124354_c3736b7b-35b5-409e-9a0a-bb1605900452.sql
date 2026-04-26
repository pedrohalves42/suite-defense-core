-- Add billing period columns to subscription_plans
ALTER TABLE subscription_plans
ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT 'monthly' 
  CHECK (billing_period IN ('monthly', '6m', '12m', '24m')),
ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update existing plans to be monthly
UPDATE subscription_plans 
SET billing_period = 'monthly', discount_pct = 0, is_active = true
WHERE billing_period IS NULL;

-- Insert 6-month variants with 4% discount for business plans
INSERT INTO subscription_plans (name, max_users, max_agents, max_devices, max_scans_per_month, price_per_device, stripe_price_id, trial_days, billing_period, discount_pct, is_active)
SELECT 
  name || '_6m',
  max_users,
  max_agents,
  max_devices,
  max_scans_per_month,
  price_per_device,
  NULL, -- Will be set when Stripe prices are created
  trial_days,
  '6m',
  4.00,
  true
FROM subscription_plans 
WHERE billing_period = 'monthly' AND name IN ('starter', 'pro', 'scale')
ON CONFLICT DO NOTHING;

-- Insert 12-month variants with 8% discount
INSERT INTO subscription_plans (name, max_users, max_agents, max_devices, max_scans_per_month, price_per_device, stripe_price_id, trial_days, billing_period, discount_pct, is_active)
SELECT 
  name || '_12m',
  max_users,
  max_agents,
  max_devices,
  max_scans_per_month,
  price_per_device,
  NULL,
  trial_days,
  '12m',
  8.00,
  true
FROM subscription_plans 
WHERE billing_period = 'monthly' AND name IN ('starter', 'pro', 'scale')
ON CONFLICT DO NOTHING;

-- Insert 24-month variants with 16% discount
INSERT INTO subscription_plans (name, max_users, max_agents, max_devices, max_scans_per_month, price_per_device, stripe_price_id, trial_days, billing_period, discount_pct, is_active)
SELECT 
  name || '_24m',
  max_users,
  max_agents,
  max_devices,
  max_scans_per_month,
  price_per_device,
  NULL,
  trial_days,
  '24m',
  16.00,
  true
FROM subscription_plans 
WHERE billing_period = 'monthly' AND name IN ('starter', 'pro', 'scale')
ON CONFLICT DO NOTHING;

-- Create index for billing period queries
CREATE INDEX IF NOT EXISTS idx_subscription_plans_billing_period 
ON subscription_plans(name, billing_period) WHERE is_active = true;