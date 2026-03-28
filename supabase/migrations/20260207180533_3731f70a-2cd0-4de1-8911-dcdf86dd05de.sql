-- =======================================================
-- SINCRONIZACAO DE THRESHOLDS: get_agent_health_metrics
-- =======================================================
-- Atualiza a RPC para incluir estado 'warning' entre 'healthy' e 'critical'

CREATE OR REPLACE FUNCTION public.get_agent_health_metrics(p_tenant_id uuid)
RETURNS TABLE(
  id uuid, 
  agent_name text, 
  hostname text, 
  os_type text, 
  os_version text, 
  agent_version text, 
  status text, 
  last_heartbeat timestamp with time zone, 
  enrolled_at timestamp with time zone, 
  health_status text, 
  seconds_since_heartbeat integer, 
  is_throttled boolean, 
  throttle_reason text, 
  is_isolated boolean, 
  isolation_reason text, 
  is_in_safe_mode boolean, 
  safe_mode_reason text, 
  has_critical_alerts boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.agent_name,
    a.hostname,
    a.os_type,
    a.os_version,
    a.agent_version,
    a.status,
    a.last_heartbeat,
    a.enrolled_at,
    -- Thresholds centralizados: 2 min (healthy), 5 min (warning), 10 min (offline)
    CASE
      WHEN a.last_heartbeat IS NULL THEN 'never_connected'::TEXT
      -- OFFLINE: mais de 10 minutos
      WHEN a.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN 'offline'::TEXT
      -- CRITICAL: tem alertas criticos nao resolvidos
      WHEN EXISTS (
        SELECT 1 FROM system_alerts sa 
        WHERE sa.agent_id = a.id 
        AND sa.resolved = false 
        AND sa.severity IN ('critical', 'high')
      ) THEN 'critical'::TEXT
      -- WARNING: entre 5 e 10 minutos OU entre 2-5 minutos
      WHEN a.last_heartbeat < NOW() - INTERVAL '2 minutes' THEN 'warning'::TEXT
      -- HEALTHY: menos de 2 minutos
      ELSE 'healthy'::TEXT
    END AS health_status,
    EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER AS seconds_since_heartbeat,
    COALESCE(a.is_throttled, false) AS is_throttled,
    a.throttle_reason,
    COALESCE(a.is_isolated, false) AS is_isolated,
    a.isolation_reason,
    (a.safe_mode_entered_at IS NOT NULL) AS is_in_safe_mode,
    a.safe_mode_reason,
    EXISTS (
      SELECT 1 FROM system_alerts sa 
      WHERE sa.agent_id = a.id 
      AND sa.resolved = false 
      AND sa.severity IN ('critical', 'high')
    ) AS has_critical_alerts
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
    AND a.archived_at IS NULL
  ORDER BY a.agent_name;
END;
$function$;

COMMENT ON FUNCTION public.get_agent_health_metrics IS 
'Retorna metricas de saude dos agentes. Thresholds: healthy < 2min, warning 2-10min, offline > 10min.';