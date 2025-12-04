-- Fix: Recreate view with security_invoker
DROP VIEW IF EXISTS public.rate_limit_stats;

CREATE OR REPLACE VIEW public.rate_limit_stats
WITH (security_invoker = on)
AS
SELECT 
  endpoint,
  identifier,
  request_count,
  window_start,
  blocked_until,
  CASE WHEN blocked_until > NOW() THEN true ELSE false END as is_blocked
FROM public.rate_limits
WHERE window_start > NOW() - INTERVAL '24 hours';