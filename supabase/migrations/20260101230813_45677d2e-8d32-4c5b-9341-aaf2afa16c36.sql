-- =====================================================
-- SECURITY FIX: Remove SECURITY DEFINER from views
-- and ensure proper RLS on all new objects
-- =====================================================

-- Fix VIEW 1: dlq_risk_overview - recreate without SECURITY DEFINER
DROP VIEW IF EXISTS public.dlq_risk_overview;
CREATE VIEW public.dlq_risk_overview 
WITH (security_invoker = true)
AS
SELECT
  risk_category,
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_items,
  MAX(created_at) as newest_item,
  MIN(created_at) as oldest_item,
  CASE 
    WHEN risk_category IN ('critical', 'high') 
         AND MIN(created_at) < NOW() - INTERVAL '24 hours' 
    THEN true 
    ELSE false 
  END as requires_attention
FROM public.failed_jobs_dlq
GROUP BY risk_category;

-- Fix VIEW 2: circuit_breaker_health - recreate without SECURITY DEFINER
DROP VIEW IF EXISTS public.circuit_breaker_health;
CREATE VIEW public.circuit_breaker_health
WITH (security_invoker = true)
AS
SELECT
  service,
  state,
  failure_count,
  created_at as last_event,
  tenant_id,
  CASE 
    WHEN state = 'open' THEN 'critical'
    WHEN state = 'half_open' THEN 'warning'
    ELSE 'healthy'
  END as health_status
FROM public.circuit_breaker_events cb1
WHERE created_at = (
  SELECT MAX(created_at) 
  FROM public.circuit_breaker_events cb2 
  WHERE cb2.service = cb1.service
);