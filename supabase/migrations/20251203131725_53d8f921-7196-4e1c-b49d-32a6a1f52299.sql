-- Fix views to work with actual data (generated, command_copied events)

-- 1. Recreate agent_installation_metrics to use ALL events
DROP VIEW IF EXISTS public.agent_installation_metrics;

CREATE VIEW public.agent_installation_metrics
WITH (security_invoker = on)
AS
SELECT
  ia.tenant_id,
  ia.platform,
  COUNT(*) FILTER (WHERE ia.event_type = 'generated') as total_generated,
  COUNT(*) FILTER (WHERE ia.event_type = 'downloaded') as total_downloaded,
  COUNT(*) FILTER (WHERE ia.event_type = 'command_copied') as total_copied,
  COUNT(*) FILTER (WHERE ia.event_type IN ('installed', 'post_installation')) as total_installed,
  COUNT(*) FILTER (WHERE ia.success = true) as successful_events,
  COUNT(*) FILTER (WHERE ia.success = false) as failed_events,
  ROUND(AVG(ia.installation_time_seconds) FILTER (WHERE ia.installation_time_seconds IS NOT NULL), 2) as avg_install_time_seconds,
  COUNT(*) FILTER (WHERE ia.network_connectivity = true) as with_network,
  COUNT(*) FILTER (WHERE ia.network_connectivity = false) as without_network,
  MAX(ia.created_at) as last_event_at
FROM public.installation_analytics ia
WHERE ia.tenant_id IN (
  SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
)
GROUP BY ia.tenant_id, ia.platform;

-- 2. Recreate installation_health_status to use agent status instead of post_installation only
DROP VIEW IF EXISTS public.installation_health_status;

CREATE VIEW public.installation_health_status
WITH (security_invoker = on)
AS
SELECT
  a.tenant_id,
  COUNT(*) as total_agents,
  COUNT(*) FILTER (WHERE a.status = 'active' AND a.last_heartbeat >= NOW() - INTERVAL '5 minutes') as active_agents,
  COUNT(*) FILTER (WHERE a.status = 'pending') as pending_agents,
  COUNT(*) FILTER (WHERE a.status = 'active' AND (a.last_heartbeat IS NULL OR a.last_heartbeat < NOW() - INTERVAL '30 minutes')) as stuck_agents,
  CASE 
    WHEN COUNT(*) > 0 
    THEN ROUND((COUNT(*) FILTER (WHERE a.status = 'active')::numeric / COUNT(*)::numeric) * 100, 1)
    ELSE 0
  END as activation_rate_pct,
  'last_24h'::text as window_interval
FROM public.agents a
WHERE a.enrolled_at > NOW() - INTERVAL '24 hours'
  AND a.tenant_id IN (
    SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
  )
GROUP BY a.tenant_id;

-- 3. Recreate installation_error_summary to include ALL event types with errors
DROP VIEW IF EXISTS public.installation_error_summary;

CREATE VIEW public.installation_error_summary
WITH (security_invoker = on)
AS
SELECT
  ia.tenant_id,
  ia.platform,
  ia.event_type,
  ia.error_message,
  COUNT(*) as error_count,
  MAX(ia.created_at) as last_occurrence
FROM public.installation_analytics ia
WHERE ia.success = false
  AND ia.error_message IS NOT NULL
  AND ia.tenant_id IN (
    SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
  )
GROUP BY ia.tenant_id, ia.platform, ia.event_type, ia.error_message
ORDER BY error_count DESC;