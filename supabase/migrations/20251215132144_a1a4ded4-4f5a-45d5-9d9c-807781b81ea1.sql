-- Populate stripe_price_id for extended period plans with already-created Stripe prices

-- Starter plans
UPDATE public.subscription_plans SET stripe_price_id = 'price_1SebfdFeHfNScQDPagYoYiQK' 
WHERE name = 'starter_6m';
UPDATE public.subscription_plans SET stripe_price_id = 'price_1SebfdFeHfNScQDP3RcAEjQy' 
WHERE name = 'starter_12m';
UPDATE public.subscription_plans SET stripe_price_id = 'price_1SebfeFeHfNScQDPvmg5xZmw' 
WHERE name = 'starter_24m';

-- Pro plans
UPDATE public.subscription_plans SET stripe_price_id = 'price_1SebfeFeHfNScQDPqCc4Xsfi' 
WHERE name = 'pro_6m';
UPDATE public.subscription_plans SET stripe_price_id = 'price_1SebffFeHfNScQDPaZwskJzM' 
WHERE name = 'pro_12m';
UPDATE public.subscription_plans SET stripe_price_id = 'price_1SebffFeHfNScQDPs0lVmrbQ' 
WHERE name = 'pro_24m';

-- Scale plans
UPDATE public.subscription_plans SET stripe_price_id = 'price_1SebfgFeHfNScQDPbFP4yUX9' 
WHERE name = 'scale_6m';
UPDATE public.subscription_plans SET stripe_price_id = 'price_1SebfgFeHfNScQDPxzUCEvdI' 
WHERE name = 'scale_12m';
UPDATE public.subscription_plans SET stripe_price_id = 'price_1SebfhFeHfNScQDPicxmADbr' 
WHERE name = 'scale_24m';