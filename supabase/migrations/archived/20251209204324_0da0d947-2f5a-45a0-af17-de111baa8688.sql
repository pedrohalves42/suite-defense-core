-- Update subscription_plans with new hybrid pricing model
-- Starter: R$ 150 base (5 devices) + R$ 20/additional (max 30)
-- Business: R$ 450 base (25 devices) + R$ 18/additional (max 200)

UPDATE public.subscription_plans 
SET max_devices = 30
WHERE name = 'starter';

UPDATE public.subscription_plans 
SET max_devices = 200
WHERE name = 'pro';

-- Delete the scale plan since we're simplifying to Free, Starter, Business, Enterprise
DELETE FROM public.subscription_plans WHERE name = 'scale';

-- Ensure enterprise has unlimited devices
UPDATE public.subscription_plans 
SET max_devices = 999999
WHERE name = 'enterprise';