-- Migration: Corrigir v_system_cycle_health com security_invoker + tenant isolation
-- ADR-023 compliance

DROP VIEW IF EXISTS public.v_system_cycle_health;

CREATE VIEW public.v_system_cycle_health 
WITH (security_invoker = on) AS
SELECT 
  'ai_actions_pending_verification' as cycle,
  COUNT(*) as pending_count,
  MIN(executed_at) as oldest_pending
FROM ai_actions
WHERE effectiveness_status = 'pending' 
  AND status = 'executed'
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
UNION ALL
SELECT 
  'insights_without_action' as cycle,
  COUNT(*) as pending_count,
  MIN(i.created_at) as oldest_pending
FROM ai_insights i
LEFT JOIN ai_actions a ON a.insight_id = i.id
WHERE i.severity IN ('critical', 'high')
  AND i.acknowledged = false
  AND a.id IS NULL
  AND i.created_at > NOW() - INTERVAL '7 days'
  AND (i.tenant_id = get_active_tenant_id() OR is_current_super_admin())
UNION ALL
SELECT 
  'unresolved_alerts' as cycle,
  COUNT(*) as pending_count,
  MIN(created_at) as oldest_pending
FROM system_alerts
WHERE resolved_at IS NULL
  AND created_at < NOW() - INTERVAL '24 hours'
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
UNION ALL
SELECT 
  'orphan_pending_jobs' as cycle,
  COUNT(*) as pending_count,
  MIN(created_at) as oldest_pending
FROM jobs
WHERE status = 'pending'
  AND expires_at < NOW()
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- Grant apenas para authenticated e service_role
GRANT SELECT ON public.v_system_cycle_health TO authenticated;
GRANT SELECT ON public.v_system_cycle_health TO service_role;

-- Documentar seguranca
COMMENT ON VIEW public.v_system_cycle_health IS 
  'ADR-023: System health metrics with security_invoker=on + tenant isolation';