-- =============================================================================
-- FIX: Signup 500 Error - Duplicate Key Violation on tenant_subscriptions
-- SQLSTATE 23505: tenant_subscriptions_tenant_id_key
-- =============================================================================
-- Problem: Two triggers create subscriptions for the same tenant:
--   1) create_tenant_subscription (on tenants) 
--   2) handle_new_user (on auth.users)
-- Solution: Make both idempotent with ON CONFLICT handling
-- =============================================================================

-- 1) Harden create_default_subscription with ON CONFLICT DO NOTHING
CREATE OR REPLACE FUNCTION public.create_default_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  -- Get Free plan ID
  SELECT id INTO free_plan_id 
  FROM subscription_plans 
  WHERE LOWER(name) = 'free' 
  LIMIT 1;
  
  -- Only insert if free plan exists
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, device_quantity)
    VALUES (NEW.id, free_plan_id, 'active', 1)
    ON CONFLICT (tenant_id) DO NOTHING;  -- Idempotent: skip if already exists
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2) Update handle_new_user with UPSERT for subscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
  company_name TEXT;
  free_plan_id UUID;
  trial_end_date TIMESTAMPTZ;
BEGIN
  -- Extract company name from metadata or use email domain
  company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    split_part(NEW.email, '@', 2)
  );
  
  -- Create tenant
  INSERT INTO tenants (name, owner_id)
  VALUES (company_name, NEW.id)
  RETURNING id INTO new_tenant_id;
  
  -- Assign owner role
  INSERT INTO user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'owner');
  
  -- Create profile
  INSERT INTO profiles (id, user_id, full_name, username)
  VALUES (
    gen_random_uuid(),
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    split_part(NEW.email, '@', 1)
  );
  
  -- Get Free plan ID
  SELECT id INTO free_plan_id 
  FROM subscription_plans 
  WHERE LOWER(name) = 'free' 
  LIMIT 1;
  
  -- Calculate trial end date
  trial_end_date := NOW() + INTERVAL '14 days';
  
  -- UPSERT subscription: create or update to trialing status
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO tenant_subscriptions (
      tenant_id, 
      plan_id, 
      status, 
      trial_end, 
      current_period_start,
      current_period_end,
      device_quantity
    )
    VALUES (
      new_tenant_id, 
      free_plan_id, 
      'trialing', 
      trial_end_date,
      NOW(),
      trial_end_date,
      1
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      status = 'trialing',
      trial_end = trial_end_date,
      current_period_start = NOW(),
      current_period_end = trial_end_date,
      updated_at = NOW();
  ELSE
    RAISE WARNING '[handle_new_user] Free plan not found - subscription not created for tenant %', new_tenant_id;
  END IF;
  
  -- Ensure tenant features
  PERFORM ensure_tenant_features(new_tenant_id);
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] Error for user %: % (SQLSTATE: %)', NEW.id, SQLERRM, SQLSTATE;
    RAISE;
END;
$$;

-- Document the fix
COMMENT ON FUNCTION public.handle_new_user() IS 
  'ADR-024: Handles new user signup with idempotent UPSERT for subscriptions to prevent 23505 errors';
COMMENT ON FUNCTION public.create_default_subscription() IS 
  'ADR-024: Creates default subscription with ON CONFLICT DO NOTHING for double-trigger safety';