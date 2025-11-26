-- Phase 4: Fix audit_logs_safe and installation_metrics_summary views with tenant filtering

-- 1. Recreate audit_logs_safe with security_invoker and tenant filtering
DROP VIEW IF EXISTS public.audit_logs_safe CASCADE;

CREATE VIEW public.audit_logs_safe 
WITH (security_invoker = on) AS
SELECT 
  id,
  created_at,
  tenant_id,
  success,
  details,
  action,
  resource_type,
  resource_id,
  CASE 
    WHEN ip_address IS NOT NULL 
    THEN split_part(ip_address, '.', 1) || '.' || split_part(ip_address, '.', 2) || '.xxx.xxx'
    ELSE NULL 
  END AS ip_address_masked,
  user_agent
FROM public.audit_logs
WHERE tenant_id IN (
  SELECT tenant_id 
  FROM public.user_roles 
  WHERE user_id = auth.uid()
);

-- 2. Recreate installation_metrics_summary with security_invoker and tenant filtering
DROP VIEW IF EXISTS public.installation_metrics_summary CASCADE;

CREATE VIEW public.installation_metrics_summary 
WITH (security_invoker = on) AS
SELECT 
  tenant_id,
  platform,
  event_type,
  COUNT(*) AS event_count,
  date_trunc('day', created_at) AS date
FROM public.installation_analytics
WHERE tenant_id IN (
  SELECT tenant_id 
  FROM public.user_roles 
  WHERE user_id = auth.uid()
)
GROUP BY tenant_id, platform, event_type, date_trunc('day', created_at);

COMMENT ON VIEW public.audit_logs_safe IS 'Tenant-isolated view of audit logs with masked IP addresses';
COMMENT ON VIEW public.installation_metrics_summary IS 'Tenant-isolated summary of installation metrics by platform and event type';