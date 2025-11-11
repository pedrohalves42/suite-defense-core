-- Fix search_path for all functions to prevent schema poisoning attacks

-- Function: cleanup_old_failed_attempts
DROP FUNCTION IF EXISTS public.cleanup_old_failed_attempts();
CREATE OR REPLACE FUNCTION public.cleanup_old_failed_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.failed_login_attempts
  WHERE created_at < now() - interval '24 hours';
  
  DELETE FROM public.ip_blocklist
  WHERE blocked_until < now();
END;
$$;

-- Function: cleanup_old_metrics
DROP FUNCTION IF EXISTS public.cleanup_old_metrics();
CREATE OR REPLACE FUNCTION public.cleanup_old_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM agent_system_metrics
  WHERE collected_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Function: cleanup_old_security_logs
DROP FUNCTION IF EXISTS public.cleanup_old_security_logs();
CREATE OR REPLACE FUNCTION public.cleanup_old_security_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.security_logs
  WHERE created_at < now() - INTERVAL '90 days';
END;
$$;

-- Function: get_latest_agent_metrics
DROP FUNCTION IF EXISTS public.get_latest_agent_metrics(uuid);
CREATE OR REPLACE FUNCTION public.get_latest_agent_metrics(p_tenant_id uuid)
RETURNS TABLE(
  agent_id uuid,
  agent_name text,
  os_type text,
  os_version text,
  hostname text,
  status text,
  last_heartbeat timestamp with time zone,
  cpu_usage_percent numeric,
  memory_usage_percent numeric,
  disk_usage_percent numeric,
  uptime_seconds bigint,
  metrics_age_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (a.id)
    a.id,
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
    EXTRACT(EPOCH FROM (NOW() - m.collected_at))::INTEGER / 60 AS metrics_age_minutes
  FROM agents a
  LEFT JOIN agent_system_metrics m ON a.id = m.agent_id
  WHERE a.tenant_id = p_tenant_id
  ORDER BY a.id, m.collected_at DESC NULLS LAST;
END;
$$;