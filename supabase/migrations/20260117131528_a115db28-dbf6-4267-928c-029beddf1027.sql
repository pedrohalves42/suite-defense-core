-- =============================================================================
-- ADR-026 Phase 3: Security Dashboard View Fix (Dr. Vellum Audit)
-- =============================================================================
-- Fix: Use archived_at IS NULL instead of is_archived = false
-- =============================================================================

DROP VIEW IF EXISTS public.v_security_dashboard CASCADE;

CREATE VIEW public.v_security_dashboard
WITH (security_invoker = on)
AS
SELECT 
  'security_summary'::text as metric_type,
  (SELECT COUNT(*) FROM public.security_logs WHERE created_at > now() - interval '24 hours') as events_24h,
  (SELECT COUNT(*) FROM public.security_logs WHERE severity = 'critical' AND created_at > now() - interval '24 hours') as critical_events_24h,
  (SELECT COUNT(*) FROM public.agents WHERE archived_at IS NULL) as active_agents,
  now() as generated_at
WHERE 
  auth.uid() IS NOT NULL 
  AND public.is_current_super_admin();

COMMENT ON VIEW public.v_security_dashboard IS 
  'ADR-026: Super admin only view. Hardened with security_invoker.';