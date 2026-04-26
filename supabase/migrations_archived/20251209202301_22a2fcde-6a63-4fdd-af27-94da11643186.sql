-- Fix get_installation_health_status() to add tenant filtering and convert to SECURITY INVOKER
DROP FUNCTION IF EXISTS public.get_installation_health_status();

CREATE OR REPLACE FUNCTION public.get_installation_health_status(p_tenant_id uuid)
RETURNS TABLE(status text, failure_rate_pct numeric, total_attempts bigint, threshold numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate user has access to this tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: No access to tenant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 'no_data'
      WHEN (COUNT(*) FILTER (WHERE success = false)::numeric / COUNT(*)::numeric) > 0.30 THEN 'unhealthy'
      ELSE 'healthy'
    END as status,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE success = false)::numeric / COUNT(*)::numeric) * 100, 1)
      ELSE 0
    END as failure_rate_pct,
    COUNT(*) as total_attempts,
    30.0 as threshold
  FROM public.installation_analytics
  WHERE tenant_id = p_tenant_id
    AND created_at > NOW() - INTERVAL '24 hours'
    AND event_type IN ('post_installation', 'post_installation_unverified');
END;
$function$;