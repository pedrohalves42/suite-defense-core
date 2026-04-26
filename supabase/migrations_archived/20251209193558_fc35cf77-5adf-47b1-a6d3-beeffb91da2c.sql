-- V4 Pricing Strategy Migration
-- 1. Update Free plan (3 devices, 14 days trial)
UPDATE subscription_plans
SET 
  max_devices = 3, 
  max_agents = 3, 
  trial_days = 14, 
  price_per_device = 0,
  max_scans_per_month = 60,
  max_users = 2
WHERE name = 'free';

-- 2. Update Starter plan (R$150/mes fixo, ate 5 dispositivos)
UPDATE subscription_plans
SET 
  max_devices = 5, 
  max_agents = 5, 
  trial_days = 14, 
  price_per_device = 15000,
  max_scans_per_month = 60,
  max_users = 5
WHERE name = 'starter';

-- 3. Update Pro/Business plan (R$450/mes fixo, ate 25 dispositivos)
UPDATE subscription_plans
SET 
  max_devices = 25, 
  max_agents = 25, 
  trial_days = 14, 
  price_per_device = 45000,
  max_scans_per_month = NULL,
  max_users = 25
WHERE name = 'pro';

-- 4. Insert Scale plan (R$1.200/mes fixo, ate 100 dispositivos)
INSERT INTO subscription_plans (
  name, max_users, max_agents, max_devices, max_scans_per_month, 
  price_per_device, trial_days
) VALUES (
  'scale', 50, 100, 100, NULL, 120000, 14
) ON CONFLICT (name) DO UPDATE SET
  max_users = 50,
  max_agents = 100,
  max_devices = 100,
  max_scans_per_month = NULL,
  price_per_device = 120000,
  trial_days = 14;

-- 5. Update Enterprise (no automatic trial)
UPDATE subscription_plans
SET trial_days = 0
WHERE name = 'enterprise';