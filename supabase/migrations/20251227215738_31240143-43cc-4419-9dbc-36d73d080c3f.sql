-- ============================================
-- V4 PRICING MIGRATION - Complete Restructure
-- ============================================

-- 1. FREEZE OLD PLANS (don't delete, just deactivate)
UPDATE subscription_plans 
SET is_active = false 
WHERE name IN (
  'basico_residencial', 'completo_residencial', 'avancado_residencial',
  'home_basic', 'home_complete', 'home_advanced',
  'starter', 'pro', 'scale',
  'starter_6m', 'starter_12m', 'starter_24m',
  'pro_6m', 'pro_12m', 'pro_24m',
  'scale_6m', 'scale_12m', 'scale_24m'
);

-- 2. INSERT NEW V4 PLANS
INSERT INTO subscription_plans (name, stripe_price_id, max_devices, max_users, billing_period, is_active, price_per_device)
VALUES 
  ('starter_compliance', 'price_1Sj531FeHfNScQDP8kMvWUpP', 10, 20, 'monthly', true, 2900),
  ('business', 'price_1Sj53TFeHfNScQDPyAN6B3RG', 30, 50, 'monthly', true, 2400),
  ('device_addon_starter', 'price_1Sj53iFeHfNScQDPS7pve80k', 1, 1, 'monthly', true, 2900),
  ('device_addon_business', 'price_1Sj542FeHfNScQDPpgdjaKx1', 1, 1, 'monthly', true, 2400)
ON CONFLICT (name) DO UPDATE SET
  stripe_price_id = EXCLUDED.stripe_price_id,
  max_devices = EXCLUDED.max_devices,
  max_users = EXCLUDED.max_users,
  billing_period = EXCLUDED.billing_period,
  is_active = EXCLUDED.is_active,
  price_per_device = EXCLUDED.price_per_device;

-- 3. CREATE STRIPE PLAN MAPPING TABLE
CREATE TABLE IF NOT EXISTS public.stripe_plan_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_price_id text UNIQUE NOT NULL,
  stripe_product_id text NOT NULL,
  logical_plan text NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('base', 'addon')),
  base_devices integer DEFAULT 0,
  price_cents integer NOT NULL,
  currency text DEFAULT 'BRL',
  billing_interval text DEFAULT 'month',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.stripe_plan_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view stripe plan mapping"
ON public.stripe_plan_mapping
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_id = auth.uid() 
  AND role IN ('admin', 'super_admin')
));

INSERT INTO stripe_plan_mapping (stripe_price_id, stripe_product_id, logical_plan, plan_type, base_devices, price_cents)
VALUES 
  ('price_1Sj531FeHfNScQDP8kMvWUpP', 'prod_TgRwgJlh0NC2mI', 'starter_compliance', 'base', 10, 24900),
  ('price_1Sj53TFeHfNScQDPyAN6B3RG', 'prod_TgRxIiwsfoAmGU', 'business', 'base', 30, 59900),
  ('price_1Sj53iFeHfNScQDPS7pve80k', 'prod_TgRxLbexC5TDBS', 'starter_compliance', 'addon', 1, 2900),
  ('price_1Sj542FeHfNScQDPpgdjaKx1', 'prod_TgRxsLyISsc36X', 'business', 'addon', 1, 2400)
ON CONFLICT (stripe_price_id) DO UPDATE SET
  stripe_product_id = EXCLUDED.stripe_product_id,
  logical_plan = EXCLUDED.logical_plan,
  plan_type = EXCLUDED.plan_type,
  base_devices = EXCLUDED.base_devices,
  price_cents = EXCLUDED.price_cents,
  updated_at = now();

-- 4. ADD COLUMNS TO TENANT_SUBSCRIPTIONS
ALTER TABLE public.tenant_subscriptions 
ADD COLUMN IF NOT EXISTS is_legacy boolean DEFAULT false;

ALTER TABLE public.tenant_subscriptions 
ADD COLUMN IF NOT EXISTS addon_devices integer DEFAULT 0;

-- Mark existing subscriptions on old plans as legacy
UPDATE tenant_subscriptions ts
SET is_legacy = true
FROM subscription_plans sp
WHERE ts.plan_id = sp.id
AND sp.name IN (
  'basico_residencial', 'completo_residencial', 'avancado_residencial',
  'home_basic', 'home_complete', 'home_advanced',
  'starter', 'pro', 'scale',
  'starter_6m', 'starter_12m', 'starter_24m',
  'pro_6m', 'pro_12m', 'pro_24m',
  'scale_6m', 'scale_12m', 'scale_24m'
);

-- 5. CREATE VIEW FOR TENANT PLAN STATUS (using existing columns only)
CREATE OR REPLACE VIEW public.v_tenant_plan_status AS
SELECT 
  ts.id as subscription_id,
  ts.tenant_id,
  ts.stripe_subscription_id,
  sp.name as plan_name,
  sp.max_devices as base_devices,
  COALESCE(ts.addon_devices, 0) as addon_devices,
  sp.max_devices + COALESCE(ts.addon_devices, 0) as total_devices,
  ts.is_legacy,
  ts.status,
  ts.current_period_end
FROM tenant_subscriptions ts
JOIN subscription_plans sp ON ts.plan_id = sp.id;