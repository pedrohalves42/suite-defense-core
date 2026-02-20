
DROP FUNCTION IF EXISTS public.get_latest_agent_metrics(uuid);

CREATE OR REPLACE FUNCTION public.get_latest_agent_metrics(p_tenant_id uuid)
 RETURNS TABLE(agent_id uuid, agent_name text, os_type text, os_version text, hostname text, status text, last_heartbeat timestamp with time zone, cpu_usage_percent numeric, memory_usage_percent numeric, disk_usage_percent numeric, uptime_seconds bigint, metrics_age_minutes integer, agent_version text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (a.id)
    a.id as agent_id,
    a.agent_name,
    a.os_type,
    a.os_version,
    a.hostname,
    a.status,
    a.last_heartbeat,
    m.cpu_usage_percent,
    m.memory_usage_percent,
    m.disk_usage_percent,
    m.uptime_seconds,
    EXTRACT(EPOCH FROM (now() - m.collected_at))::integer / 60 as metrics_age_minutes,
    a.agent_version
  FROM agents a
  LEFT JOIN agent_system_metrics_partitioned m ON a.id = m.agent_id
  WHERE a.tenant_id = p_tenant_id
    AND a.archived_at IS NULL
  ORDER BY a.id, m.collected_at DESC NULLS LAST;
$function$;
