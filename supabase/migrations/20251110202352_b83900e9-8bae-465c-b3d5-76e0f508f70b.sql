-- ============================================
-- Phase 2: Database Structure for Stripe Subscriptions
-- ============================================

-- 2.1 Update subscription_plans table
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS stripe_price_id text UNIQUE,
ADD COLUMN IF NOT EXISTS price_per_device integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_devices integer,
ADD COLUMN IF NOT EXISTS trial_days integer DEFAULT 30;

-- Update existing plans with new structure
-- Note: stripe_price_id will be set after creating products in Stripe
UPDATE public.subscription_plans SET
  price_per_device = 0,
  max_devices = 30,
  max_scans_per_month = 60,
  trial_days = 30
WHERE name = 'free';

UPDATE public.subscription_plans SET
  price_per_device = 3000,
  max_devices = 30,
  max_scans_per_month = 60,
  trial_days = 30
WHERE name = 'starter' OR (name = 'free' AND NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE name = 'starter'));

-- Insert starter plan if it doesn't exist
INSERT INTO public.subscription_plans (name, max_users, max_agents, max_scans_per_month, price_per_device, max_devices, trial_days)
SELECT 'starter', 30, 30, 60, 3000, 30, 30
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE name = 'starter');

UPDATE public.subscription_plans SET
  price_per_device = 5000,
  max_devices = 200,
  max_scans_per_month = NULL,
  trial_days = 30
WHERE name = 'pro';

-- 2.2 Update tenant_subscriptions table
ALTER TABLE public.tenant_subscriptions 
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE,
ADD COLUMN IF NOT EXISTS device_quantity integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
ADD COLUMN IF NOT EXISTS trial_end timestamp with time zone,
ADD COLUMN IF NOT EXISTS current_period_end timestamp with time zone;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_stripe_customer 
ON public.tenant_subscriptions(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_stripe_subscription 
ON public.tenant_subscriptions(stripe_subscription_id);

-- 2.3 Create feature keys for tenant_features
-- Function to ensure tenant has all required features
CREATE OR REPLACE FUNCTION public.ensure_tenant_features(p_tenant_id uuid, p_plan_name text, p_device_quantity integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_scan_limit integer;
  v_device_limit integer;
BEGIN
  -- Determine limits based on plan
  IF p_plan_name = 'starter' THEN
    v_daily_scan_limit := 2;
    v_device_limit := 30;
  ELSIF p_plan_name = 'pro' THEN
    v_daily_scan_limit := NULL; -- unlimited
    v_device_limit := 200;
  ELSE -- free
    v_daily_scan_limit := 2;
    v_device_limit := 5;
  END IF;

  -- Advanced scans daily quota
  INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
  VALUES (p_tenant_id, 'advanced_scans_daily', true, v_daily_scan_limit, 0)
  ON CONFLICT (tenant_id, feature_key) 
  DO UPDATE SET quota_limit = v_daily_scan_limit, enabled = true;

  -- Max devices quota
  INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
  VALUES (p_tenant_id, 'max_devices', true, LEAST(v_device_limit, p_device_quantity), 0)
  ON CONFLICT (tenant_id, feature_key) 
  DO UPDATE SET quota_limit = LEAST(v_device_limit, p_device_quantity), enabled = true;

  -- Plan-specific features
  IF p_plan_name IN ('starter', 'pro') THEN
    -- Email support (all paid plans)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'email_support', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;

    -- Advanced dashboard (all paid plans)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'advanced_dashboard', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;
  END IF;

  IF p_plan_name = 'pro' THEN
    -- Priority support (Pro only)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'priority_support', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;

    -- Analytics dashboard (Pro only)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'analytics_dashboard', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;

    -- API access (Pro only)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'api_access', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;

    -- Custom reports (Pro only)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'custom_reports', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;
  END IF;
END;
$$;

-- Initialize features for existing tenants
DO $$
DECLARE
  tenant_rec RECORD;
  plan_name text;
BEGIN
  FOR tenant_rec IN SELECT DISTINCT ts.tenant_id, sp.name as plan_name, ts.device_quantity
    FROM tenant_subscriptions ts
    JOIN subscription_plans sp ON ts.plan_id = sp.id
  LOOP
    PERFORM ensure_tenant_features(tenant_rec.tenant_id, tenant_rec.plan_name, COALESCE(tenant_rec.device_quantity, 1));
  END LOOP;
END $$;