-- ============================================================
-- MIGRATION: Correcao Sistemica do Bug archived_at (v2)
-- Usando DROP/CREATE para views com dependencias
-- ============================================================

-- ============================================================
-- FASE 1: Criar View Canonica active_agents (se nao existir)
-- ============================================================
DROP VIEW IF EXISTS public.active_agents CASCADE;
CREATE VIEW public.active_agents AS
SELECT *
FROM public.agents
WHERE archived_at IS NULL;

COMMENT ON VIEW public.active_agents IS 
'Canonical operational view. Excludes archived agents. REQUIRED for all operational RPCs and dashboards.';

-- ============================================================
-- FASE 2: Recriar Views Operacionais (ordem de dependencia)
-- ============================================================

-- 2.1 agents_health_view
DROP VIEW IF EXISTS public.agents_health_view;
CREATE VIEW public.agents_health_view AS
SELECT 
  id,
  agent_name,
  hostname,
  os_type,
  os_version,
  agent_version,
  status,
  last_heartbeat,
  tenant_id,
  enrolled_at,
  is_throttled,
  throttle_reason,
  throttled_at,
  is_isolated,
  isolation_reason,
  isolated_at,
  safe_mode_entered_at,
  safe_mode_reason,
  CASE
    WHEN last_heartbeat IS NULL THEN 'never_connected'::text
    WHEN last_heartbeat < (now() - '00:10:00'::interval) THEN 'offline'::text
    WHEN last_heartbeat < (now() - '00:05:00'::interval) THEN 'critical'::text
    ELSE 'healthy'::text
  END AS health_status,
  EXTRACT(epoch FROM now() - last_heartbeat)::integer AS seconds_since_heartbeat
FROM active_agents a;

COMMENT ON VIEW public.agents_health_view IS 'Operational view for agent health. Uses active_agents (excludes archived).';

-- 2.2 v_agent_health_summary
DROP VIEW IF EXISTS public.v_agent_health_summary;
CREATE VIEW public.v_agent_health_summary AS
SELECT 
  id,
  agent_name,
  hostname,
  os_type,
  status,
  last_heartbeat,
  tenant_id,
  CASE
    WHEN last_heartbeat IS NULL THEN 'never_connected'::text
    WHEN last_heartbeat < (now() - '00:05:00'::interval) THEN 'offline'::text
    ELSE 'online'::text
  END AS connection_status
FROM active_agents a
WHERE tenant_id IN (
  SELECT ur.tenant_id
  FROM user_roles ur
  WHERE ur.user_id = auth.uid()
);

COMMENT ON VIEW public.v_agent_health_summary IS 'Operational summary view. Uses active_agents (excludes archived).';

-- 2.3 v_agent_execution_health
DROP VIEW IF EXISTS public.v_agent_execution_health;
CREATE VIEW public.v_agent_execution_health AS
SELECT 
  a.id AS agent_id,
  a.agent_name,
  a.tenant_id,
  a.status,
  a.last_heartbeat,
  a.agent_mode,
  a.agent_version,
  round(EXTRACT(epoch FROM now() - a.last_heartbeat) / 60::numeric) AS minutes_since_heartbeat,
  je.last_execution_at,
  round(EXTRACT(epoch FROM now() - je.last_execution_at) / 60::numeric) AS minutes_since_execution,
  COALESCE(stale_q.stale_queued_jobs, 0::bigint) AS stale_queued_jobs,
  COALESCE(stale_d.stale_delivered_jobs, 0::bigint) AS stale_delivered_jobs,
  COALESCE(pending.pending_jobs, 0::bigint) AS pending_jobs,
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'never_connected'::text
    WHEN a.last_heartbeat < (now() - '00:30:00'::interval) THEN 'offline'::text
    WHEN a.agent_mode = 'SAFE_MODE'::text THEN 'safe_mode'::text
    WHEN COALESCE(stale_q.stale_queued_jobs, 0::bigint) > 3 THEN 'not_polling_jobs'::text
    WHEN COALESCE(stale_d.stale_delivered_jobs, 0::bigint) > 2 THEN 'not_executing_jobs'::text
    WHEN je.last_execution_at IS NOT NULL AND je.last_execution_at < (now() - '04:00:00'::interval) AND COALESCE(pending.pending_jobs, 0::bigint) > 0 THEN 'execution_stale'::text
    ELSE 'healthy'::text
  END AS health_status,
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'critical'::text
    WHEN a.last_heartbeat < (now() - '00:30:00'::interval) THEN 'high'::text
    WHEN COALESCE(stale_q.stale_queued_jobs, 0::bigint) > 10 THEN 'critical'::text
    WHEN COALESCE(stale_q.stale_queued_jobs, 0::bigint) > 5 THEN 'high'::text
    WHEN COALESCE(stale_q.stale_queued_jobs, 0::bigint) > 3 THEN 'medium'::text
    WHEN COALESCE(stale_d.stale_delivered_jobs, 0::bigint) > 2 THEN 'medium'::text
    ELSE 'low'::text
  END AS severity,
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'Agente nunca conectou ao sistema'::text
    WHEN a.last_heartbeat < (now() - '00:30:00'::interval) THEN 'Agente offline ha mais de 30 minutos'::text
    WHEN a.agent_mode = 'SAFE_MODE'::text THEN 'Agente em modo seguro - execucao limitada'::text
    WHEN COALESCE(stale_q.stale_queued_jobs, 0::bigint) > 3 THEN 'Agente online mas nao esta buscando jobs ha mais de 1 hora'::text
    WHEN COALESCE(stale_d.stale_delivered_jobs, 0::bigint) > 2 THEN 'Agente recebeu jobs mas nao esta executando ha mais de 30 minutos'::text
    WHEN je.last_execution_at IS NOT NULL AND je.last_execution_at < (now() - '04:00:00'::interval) AND COALESCE(pending.pending_jobs, 0::bigint) > 0 THEN 'Ultima execucao ha mais de 4 horas com jobs pendentes'::text
    ELSE 'Agente funcionando normalmente'::text
  END AS health_description,
  now() AS checked_at
FROM active_agents a
LEFT JOIN LATERAL (
  SELECT max(je_1.finished_at) AS last_execution_at
  FROM job_executions je_1
  WHERE je_1.agent_id = a.id
) je ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS stale_queued_jobs
  FROM jobs j
  WHERE j.agent_id = a.id AND j.status = 'queued'::text AND j.created_at < (now() - '01:00:00'::interval)
) stale_q ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS stale_delivered_jobs
  FROM jobs j
  WHERE j.agent_id = a.id AND j.status = 'delivered'::text AND j.delivered_at < (now() - '00:30:00'::interval)
) stale_d ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS pending_jobs
  FROM jobs j
  WHERE j.agent_id = a.id AND (j.status = ANY (ARRAY['queued'::text, 'delivered'::text]))
) pending ON true
WHERE a.status = 'active'::text;

COMMENT ON VIEW public.v_agent_execution_health IS 'Execution health view. Uses active_agents (excludes archived).';

-- 2.4 agents_safe
DROP VIEW IF EXISTS public.agents_safe;
CREATE VIEW public.agents_safe AS
SELECT 
  id,
  agent_name,
  hostname,
  os_type,
  os_version,
  agent_version,
  status,
  last_heartbeat,
  tenant_id,
  enrolled_at,
  payload_hash
FROM active_agents a
WHERE tenant_id IN (
  SELECT ur.tenant_id
  FROM user_roles ur
  WHERE ur.user_id = auth.uid()
);

COMMENT ON VIEW public.agents_safe IS 'Safe view for frontend. Uses active_agents (excludes archived).';

-- 2.5 v_agent_lifecycle_state
DROP VIEW IF EXISTS public.v_agent_lifecycle_state;
CREATE VIEW public.v_agent_lifecycle_state AS
SELECT 
  a.id AS agent_id,
  a.agent_name,
  a.tenant_id,
  a.status AS agent_status,
  a.enrolled_at::text AS enrolled_at,
  a.last_heartbeat::text AS last_heartbeat,
  a.os_type,
  a.os_version,
  a.hostname,
  (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'generated' ORDER BY ia.created_at DESC LIMIT 1) AS generated_at,
  (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'downloaded' ORDER BY ia.created_at DESC LIMIT 1) AS downloaded_at,
  (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied' ORDER BY ia.created_at DESC LIMIT 1) AS command_copied_at,
  (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation') ORDER BY ia.created_at DESC LIMIT 1) AS installed_at,
  CASE
    WHEN a.status = 'active' AND a.last_heartbeat > (now() - '00:05:00'::interval) THEN 'active'::text
    WHEN EXISTS (SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation')) THEN 'installed_offline'::text
    WHEN EXISTS (SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied') THEN 'installing'::text
    WHEN EXISTS (SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'downloaded') THEN 'downloaded'::text
    WHEN EXISTS (SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'generated') THEN 'generated'::text
    ELSE 'unknown'::text
  END AS lifecycle_stage,
  (SELECT ia.installation_time_seconds FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation') AND ia.success = true ORDER BY ia.created_at DESC LIMIT 1) AS installation_time_seconds,
  (SELECT ia.success FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation') ORDER BY ia.created_at DESC LIMIT 1) AS installation_success,
  (SELECT ia.network_connectivity FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation') ORDER BY ia.created_at DESC LIMIT 1) AS network_connectivity,
  (SELECT ia.error_message FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.success = false ORDER BY ia.created_at DESC LIMIT 1) AS last_error_message,
  (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.success = false ORDER BY ia.created_at DESC LIMIT 1) AS last_error_at,
  (SELECT ia.platform FROM installation_analytics ia WHERE ia.agent_id = a.id ORDER BY ia.created_at DESC LIMIT 1) AS platform,
  (SELECT ia.installation_method FROM installation_analytics ia WHERE ia.agent_id = a.id ORDER BY ia.created_at DESC LIMIT 1) AS installation_method,
  (SELECT ia.metadata FROM installation_analytics ia WHERE ia.agent_id = a.id ORDER BY ia.created_at DESC LIMIT 1) AS installation_metadata,
  EXTRACT(epoch FROM now() - a.last_heartbeat) / 60::numeric AS minutes_since_heartbeat,
  EXTRACT(epoch FROM now() - a.enrolled_at) / 60::numeric AS minutes_since_enrollment,
  (
    SELECT EXTRACT(epoch FROM 
      (SELECT ia2.created_at FROM installation_analytics ia2 WHERE ia2.agent_id = a.id AND ia2.event_type IN ('installed', 'post_installation') ORDER BY ia2.created_at DESC LIMIT 1) - 
      (SELECT ia3.created_at FROM installation_analytics ia3 WHERE ia3.agent_id = a.id AND ia3.event_type = 'generated' ORDER BY ia3.created_at DESC LIMIT 1)
    ) / 60::numeric
  ) AS minutes_to_install
FROM active_agents a;

COMMENT ON VIEW public.v_agent_lifecycle_state IS 'Lifecycle state view. Uses active_agents (excludes archived).';

-- ============================================================
-- FASE 3: Corrigir RPCs Operacionais
-- ============================================================

-- 3.1 get_latest_agent_metrics
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
  FROM active_agents a
  LEFT JOIN agent_system_metrics_partitioned m ON a.id = m.agent_id
  WHERE a.tenant_id = p_tenant_id
  ORDER BY a.id, m.collected_at DESC NULLS LAST;
END;
$$;

-- 3.2 get_agent_health_metrics
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
SET search_path = public
AS $$
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
    CASE
      WHEN a.last_heartbeat IS NULL THEN 'never_connected'::TEXT
      WHEN a.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN 'offline'::TEXT
      WHEN EXISTS (
        SELECT 1 FROM system_alerts sa 
        WHERE sa.agent_id = a.id 
        AND sa.resolved = false 
        AND sa.severity IN ('critical', 'high')
      ) THEN 'critical'::TEXT
      WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'critical'::TEXT
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
  FROM active_agents a
  WHERE a.tenant_id = p_tenant_id
  ORDER BY a.agent_name;
END;
$$;

-- 3.3 get_problematic_agents
CREATE OR REPLACE FUNCTION public.get_problematic_agents(p_tenant_id uuid)
RETURNS TABLE(
  id uuid, 
  agent_name text, 
  status text, 
  created_at timestamp with time zone, 
  minutes_since_creation numeric, 
  installation_success boolean, 
  network_connectivity boolean, 
  metadata jsonb
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
      AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Access denied: user does not belong to tenant %', p_tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT 
    a.id,
    a.agent_name,
    a.status,
    a.enrolled_at AS created_at,
    EXTRACT(EPOCH FROM (NOW() - a.enrolled_at))::numeric / 60 AS minutes_since_creation,
    ia.success AS installation_success,
    ia.network_connectivity,
    ia.metadata
  FROM active_agents a
  LEFT JOIN LATERAL (
    SELECT success, network_connectivity, metadata
    FROM installation_analytics
    WHERE agent_id = a.id
      AND event_type = 'post_installation'
    ORDER BY created_at DESC
    LIMIT 1
  ) ia ON true
  WHERE a.status = 'pending'
    AND a.last_heartbeat IS NULL
    AND a.enrolled_at < NOW() - INTERVAL '5 minutes'
    AND a.tenant_id = p_tenant_id
  ORDER BY a.enrolled_at DESC;
END;
$$;

-- 3.4 detect_improdutive_agents
CREATE OR REPLACE FUNCTION public.detect_improdutive_agents()
RETURNS TABLE(
  agent_id uuid, 
  agent_name text, 
  tenant_id uuid, 
  health_status text, 
  minutes_since_heartbeat numeric, 
  minutes_since_execution numeric, 
  stale_queued_jobs bigint, 
  pending_jobs bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.agent_id,
    v.agent_name,
    v.tenant_id,
    v.health_status,
    v.minutes_since_heartbeat,
    v.minutes_since_execution,
    v.stale_queued_jobs,
    v.pending_jobs
  FROM v_agent_execution_health v
  JOIN active_agents a ON a.id = v.agent_id
  WHERE v.health_status IN ('not_polling_jobs', 'not_executing_jobs', 'execution_stale')
    AND v.minutes_since_heartbeat < 30
    AND COALESCE(a.is_throttled, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM decision_events de
      WHERE de.agent_id = v.agent_id
        AND de.rule_code = 'AGENT_IMPRODUTIVE_005'
        AND de.created_at > NOW() - INTERVAL '2 hours'
    )
    AND v.health_status != 'safe_mode'
    AND (
      v.stale_queued_jobs >= 3
      OR v.minutes_since_execution > 120
    );
END;
$$;