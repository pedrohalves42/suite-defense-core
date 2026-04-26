-- Fix SECURITY DEFINER view issue by explicitly setting security_invoker
-- This ensures the view runs with the privileges of the querying user, not the view owner

DROP VIEW IF EXISTS public.installation_metrics_summary;

CREATE VIEW public.installation_metrics_summary
WITH (security_invoker = true)
AS
SELECT 
  tenant_id,
  platform,
  event_type,
  COUNT(*) AS event_count,
  DATE_TRUNC('day', created_at) AS date
FROM public.installation_analytics
GROUP BY tenant_id, platform, event_type, DATE_TRUNC('day', created_at);