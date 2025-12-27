-- Fix security definer view warning by using SECURITY INVOKER (default)
DROP VIEW IF EXISTS public.v_tenant_plan_status;

CREATE VIEW public.v_tenant_plan_status 
WITH (security_invoker = on) AS
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