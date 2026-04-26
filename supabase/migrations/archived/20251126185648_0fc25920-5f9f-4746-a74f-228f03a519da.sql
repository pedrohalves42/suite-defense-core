-- =====================================================
-- FASE 1: CORRIGIR VIEWS SECURITY DEFINER (P0 CRITICAL)
-- =====================================================
-- Corrigir 3 views que bypassam RLS e permitem vazamento cross-tenant
-- Adicionar security_invoker=on e filtro explicito de tenant_id

-- =====================================================
-- 1. v_agent_lifecycle_state
-- =====================================================
DROP VIEW IF EXISTS public.v_agent_lifecycle_state CASCADE;

CREATE VIEW public.v_agent_lifecycle_state
WITH (security_invoker=on)
AS
SELECT
  a.id AS agent_id,
  a.agent_name,
  a.tenant_id,
  a.enrolled_at,
  a.last_heartbeat,
  a.status,
  
  -- Timestamps de eventos do ciclo de vida
  ia_gen.created_at AS generated_at,
  ia_down.created_at AS downloaded_at,
  ia_copy.created_at AS command_copied_at,
  ia_inst.created_at AS installed_at,
  
  -- Tempo de instalacao
  CASE 
    WHEN ia_inst.created_at IS NOT NULL AND ia_copy.created_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (ia_inst.created_at - ia_copy.created_at))::INTEGER
    ELSE NULL
  END AS installation_time_seconds,
  
  -- Estagio do ciclo de vida
  CASE
    WHEN a.last_heartbeat IS NOT NULL AND a.last_heartbeat > NOW() - INTERVAL '5 minutes' THEN 'active'
    WHEN ia_inst.created_at IS NOT NULL THEN 'installed_inactive'
    WHEN ia_copy.created_at IS NOT NULL THEN 'command_copied'
    WHEN ia_down.created_at IS NOT NULL THEN 'downloaded'
    WHEN ia_gen.created_at IS NOT NULL THEN 'generated'
    ELSE 'unknown'
  END AS lifecycle_stage,
  
  -- Deteccao de agentes travados
  CASE
    WHEN a.status = 'pending' 
     AND a.last_heartbeat IS NULL 
     AND a.enrolled_at < NOW() - INTERVAL '10 minutes' THEN true
    ELSE false
  END AS is_stuck
  
FROM public.agents a
LEFT JOIN LATERAL (
  SELECT created_at 
  FROM public.installation_analytics 
  WHERE agent_id = a.id 
    AND event_type = 'installer_generated' 
  ORDER BY created_at ASC 
  LIMIT 1
) ia_gen ON true
LEFT JOIN LATERAL (
  SELECT created_at 
  FROM public.installation_analytics 
  WHERE agent_id = a.id 
    AND event_type = 'installer_downloaded' 
  ORDER BY created_at ASC 
  LIMIT 1
) ia_down ON true
LEFT JOIN LATERAL (
  SELECT created_at 
  FROM public.installation_analytics 
  WHERE agent_id = a.id 
    AND event_type = 'command_copied' 
  ORDER BY created_at ASC 
  LIMIT 1
) ia_copy ON true
LEFT JOIN LATERAL (
  SELECT created_at 
  FROM public.installation_analytics 
  WHERE agent_id = a.id 
    AND event_type IN ('post_installation', 'installed') 
  ORDER BY created_at ASC 
  LIMIT 1
) ia_inst ON true
WHERE a.tenant_id IN (
  SELECT tenant_id 
  FROM public.user_roles 
  WHERE user_id = auth.uid()
);

COMMENT ON VIEW public.v_agent_lifecycle_state IS 
'View segura do ciclo de vida dos agentes com isolamento por tenant via security_invoker';

-- =====================================================
-- 2. v_agent_health_summary
-- =====================================================
DROP VIEW IF EXISTS public.v_agent_health_summary CASCADE;

CREATE VIEW public.v_agent_health_summary
WITH (security_invoker=on)
AS
SELECT
  a.id,
  a.agent_name,
  a.tenant_id,
  a.status,
  a.last_heartbeat,
  a.agent_version,
  a.os_type,
  a.os_version,
  a.hostname,
  
  -- Heartbeat health
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'never_connected'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'offline'
    ELSE 'online'
  END AS heartbeat_status,
  
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER AS seconds_since_heartbeat,
  
  -- Jobs statistics (ultimas 24h)
  COALESCE(j.total_jobs, 0) AS total_jobs_24h,
  COALESCE(j.completed_jobs, 0) AS completed_jobs_24h,
  COALESCE(j.failed_jobs, 0) AS failed_jobs_24h,
  
  CASE
    WHEN j.total_jobs > 0 
    THEN ROUND((j.failed_jobs::NUMERIC / j.total_jobs::NUMERIC) * 100, 1)
    ELSE 0
  END AS failure_rate_pct,
  
  -- Metricas mais recentes
  m.cpu_usage_percent,
  m.memory_usage_percent,
  m.disk_usage_percent,
  m.collected_at AS last_metrics_at
  
FROM public.agents a
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_jobs,
    COUNT(*) FILTER (WHERE status IN ('completed', 'done')) AS completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_jobs
  FROM public.jobs
  WHERE jobs.agent_id = a.id
    AND jobs.created_at > NOW() - INTERVAL '24 hours'
) j ON true
LEFT JOIN LATERAL (
  SELECT 
    cpu_usage_percent,
    memory_usage_percent,
    disk_usage_percent,
    collected_at
  FROM public.agent_system_metrics
  WHERE agent_id = a.id
  ORDER BY collected_at DESC
  LIMIT 1
) m ON true
WHERE a.tenant_id IN (
  SELECT tenant_id 
  FROM public.user_roles 
  WHERE user_id = auth.uid()
);

COMMENT ON VIEW public.v_agent_health_summary IS 
'View segura de resumo de saude dos agentes com isolamento por tenant via security_invoker';

-- =====================================================
-- 3. v_problematic_agents
-- =====================================================
DROP VIEW IF EXISTS public.v_problematic_agents CASCADE;

CREATE VIEW public.v_problematic_agents
WITH (security_invoker=on)
AS
SELECT
  a.id,
  a.agent_name,
  a.tenant_id,
  a.status,
  a.enrolled_at AS created_at,
  a.last_heartbeat,
  
  -- Tempo desde criacao
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at)) / 60 AS minutes_since_creation,
  
  -- Status de instalacao
  ia.success AS installation_success,
  ia.network_connectivity,
  ia.metadata,
  
  -- Problema detectado
  CASE
    WHEN a.last_heartbeat IS NULL AND a.enrolled_at < NOW() - INTERVAL '10 minutes' 
      THEN 'never_connected'
    WHEN a.last_heartbeat < NOW() - INTERVAL '15 minutes' 
      THEN 'stale_heartbeat'
    WHEN a.status = 'pending' AND a.enrolled_at < NOW() - INTERVAL '5 minutes' 
      THEN 'stuck_pending'
    ELSE 'unknown'
  END AS problem_type
  
FROM public.agents a
LEFT JOIN LATERAL (
  SELECT success, network_connectivity, metadata
  FROM public.installation_analytics
  WHERE agent_id = a.id
    AND event_type = 'post_installation'
  ORDER BY created_at DESC
  LIMIT 1
) ia ON true
WHERE a.tenant_id IN (
  SELECT tenant_id 
  FROM public.user_roles 
  WHERE user_id = auth.uid()
)
AND (
  -- Nunca conectou apos 10 minutos
  (a.last_heartbeat IS NULL AND a.enrolled_at < NOW() - INTERVAL '10 minutes')
  OR
  -- Heartbeat antigo (>15min)
  (a.last_heartbeat < NOW() - INTERVAL '15 minutes')
  OR
  -- Travado em pending apos 5 minutos
  (a.status = 'pending' AND a.enrolled_at < NOW() - INTERVAL '5 minutes')
);

COMMENT ON VIEW public.v_problematic_agents IS 
'View segura de agentes problematicos com isolamento por tenant via security_invoker';

-- =====================================================
-- VALIDACAO: Verificar que views estao seguras
-- =====================================================
-- Apos executar, rodar esta query para confirmar:
-- SELECT table_name, security_type 
-- FROM information_schema.views 
-- WHERE table_schema = 'public' 
--   AND table_name IN ('v_agent_lifecycle_state', 'v_agent_health_summary', 'v_problematic_agents');
-- 
-- Resultado esperado: security_type = 'INVOKER' para todas