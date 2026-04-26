-- Corrigir view SECURITY DEFINER - mudar para SECURITY INVOKER (padrao seguro)
DROP VIEW IF EXISTS public.v_agent_health_by_node;

CREATE VIEW public.v_agent_health_by_node 
WITH (security_invoker = true)
AS
SELECT 
  a.id,
  a.agent_name,
  a.hostname,
  a.status,
  a.tenant_id,
  a.last_heartbeat,
  CASE 
    WHEN a.status = 'offline' OR a.status = 'inactive' THEN 'critical'
    WHEN a.last_heartbeat IS NULL THEN 'warning'
    WHEN a.last_heartbeat < now() - interval '30 minutes' THEN 'critical'
    WHEN a.last_heartbeat < now() - interval '15 minutes' THEN 'warning'
    ELSE 'healthy'
  END as health_status,
  EXTRACT(EPOCH FROM (now() - a.last_heartbeat)) / 60 as minutes_since_heartbeat,
  (SELECT COUNT(*) FROM public.jobs j 
   WHERE j.agent_id = a.id 
   AND j.status = 'failed' 
   AND j.created_at > now() - interval '1 hour') as recent_failures,
  (SELECT COUNT(*) FROM public.failed_jobs_dlq d 
   WHERE d.agent_id = a.id 
   AND d.status = 'pending') as pending_dlq,
  (SELECT COUNT(*) FROM public.agent_safe_mode_events sm
   WHERE sm.agent_id = a.id
   AND sm.resolved_at IS NULL) as active_safe_mode_events
FROM public.agents a
WHERE a.status != 'archived';