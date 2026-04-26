-- CRITICAL FIX: Add max_users feature to ensure_tenant_features
-- This fixes the member limit logic in Members.tsx which was using device_quantity incorrectly

CREATE OR REPLACE FUNCTION public.ensure_tenant_features(p_tenant_id uuid, p_plan_name text, p_device_quantity integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_scan_limit integer;
  v_device_limit integer;
  v_max_users integer;
BEGIN
  -- Determine limits based on plan
  IF p_plan_name = 'starter' THEN
    v_daily_scan_limit := 2;
    v_device_limit := 30;
    v_max_users := 20;
  ELSIF p_plan_name = 'pro' THEN
    v_daily_scan_limit := NULL; -- unlimited
    v_device_limit := 200;
    v_max_users := 50;
  ELSIF p_plan_name = 'enterprise' THEN
    v_daily_scan_limit := NULL; -- unlimited
    v_device_limit := NULL; -- unlimited
    v_max_users := NULL; -- unlimited
  ELSE -- free
    v_daily_scan_limit := 2;
    v_device_limit := 5;
    v_max_users := 5;
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

  -- CRITICAL FIX: Add max_users feature (was missing!)
  INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
  VALUES (p_tenant_id, 'max_users', true, v_max_users, 0)
  ON CONFLICT (tenant_id, feature_key) 
  DO UPDATE SET quota_limit = v_max_users, enabled = true;

  -- Plan-specific features
  IF p_plan_name IN ('starter', 'pro', 'enterprise') THEN
    -- Email support (all paid plans)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'email_support', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;

    -- Advanced dashboard (all paid plans)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'advanced_dashboard', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;
  END IF;

  IF p_plan_name IN ('pro', 'enterprise') THEN
    -- Priority support (Pro+ only)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'priority_support', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;

    -- Analytics dashboard (Pro+ only)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'analytics_dashboard', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;

    -- API access (Pro+ only)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'api_access', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;

    -- Custom reports (Pro+ only)
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (p_tenant_id, 'custom_reports', true, NULL, 0)
    ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;
  END IF;
END;
$$;

-- Backfill max_users feature for all existing tenants
DO $$
DECLARE
  tenant_rec RECORD;
  v_max_users integer;
BEGIN
  FOR tenant_rec IN 
    SELECT DISTINCT ts.tenant_id, sp.name as plan_name
    FROM tenant_subscriptions ts
    JOIN subscription_plans sp ON ts.plan_id = sp.id
  LOOP
    -- Determine max_users based on plan
    CASE tenant_rec.plan_name
      WHEN 'starter' THEN v_max_users := 20;
      WHEN 'pro' THEN v_max_users := 50;
      WHEN 'enterprise' THEN v_max_users := NULL; -- unlimited
      ELSE v_max_users := 5; -- free
    END CASE;

    -- Insert or update max_users feature
    INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
    VALUES (tenant_rec.tenant_id, 'max_users', true, v_max_users, 0)
    ON CONFLICT (tenant_id, feature_key) 
    DO UPDATE SET quota_limit = v_max_users, enabled = true;

    RAISE NOTICE 'Updated max_users for tenant % (plan: %, limit: %)', tenant_rec.tenant_id, tenant_rec.plan_name, v_max_users;
  END LOOP;
END $$;