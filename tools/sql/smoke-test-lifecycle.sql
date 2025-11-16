-- ============================================
-- 🔍 SMOKE TEST: Lifecycle por OS (24h)
-- ============================================
-- Visão geral de distribuição de agentes por OS e lifecycle stage
-- Útil para identificar problemas de instalação rapidamente

-- Query 1: Visão Geral por OS
-- ============================================
WITH recent AS (
  SELECT
    agent_name,
    os_type,
    lifecycle_stage,
    enrolled_at,
    last_heartbeat_at,
    EXTRACT(EPOCH FROM (NOW() - last_heartbeat_at)) / 60 AS minutes_since_heartbeat,
    agent_version,
    is_stuck,
    has_errors
  FROM v_agent_lifecycle_state
  WHERE enrolled_at > NOW() - INTERVAL '24 hours'
),
agg AS (
  SELECT
    COALESCE(os_type, 'unknown') AS os_type,
    lifecycle_stage,
    COUNT(*) AS count
  FROM recent
  GROUP BY os_type, lifecycle_stage
)
SELECT
  os_type,
  lifecycle_stage,
  count,
  ROUND(100.0 * count / SUM(count) OVER (PARTITION BY os_type), 1) AS pct_within_os
FROM agg
ORDER BY
  CASE os_type
    WHEN 'macos' THEN 0
    WHEN 'windows' THEN 1
    WHEN 'linux' THEN 2
    ELSE 3
  END,
  CASE lifecycle_stage
    WHEN 'active' THEN 0
    WHEN 'installed_offline' THEN 1
    WHEN 'installing' THEN 2
    ELSE 3
  END;

-- Resultado esperado (exemplo):
-- os_type | lifecycle_stage    | count | pct_within_os
-- --------|-------------------|-------|---------------
-- macos   | active            |    10 | 100.0
-- windows | active            |    23 |  92.0
-- windows | installing        |     2 |   8.0
-- linux   | active            |     5 | 100.0


-- Query 2: macOS Específico + Eventos de Instalação
-- ============================================
WITH macos_agents AS (
  SELECT
    a.agent_name,
    a.os_type,
    a.lifecycle_stage,
    a.enrolled_at,
    a.last_heartbeat_at,
    a.agent_version,
    a.is_stuck,
    a.has_errors
  FROM v_agent_lifecycle_state a
  WHERE a.os_type = 'macos'
    AND a.enrolled_at > NOW() - INTERVAL '24 hours'
),
install_events AS (
  SELECT
    ia.agent_name,
    ia.event_type,
    ia.success,
    ia.created_at,
    ia.metadata
  FROM installation_analytics ia
  WHERE ia.platform = 'macos'
    AND ia.event_type IN ('post_installation', 'post_installation_unverified')
    AND ia.created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  m.agent_name,
  m.lifecycle_stage,
  m.enrolled_at,
  m.last_heartbeat_at,
  EXTRACT(EPOCH FROM (NOW() - m.last_heartbeat_at)) / 60 AS minutes_since_heartbeat,
  m.agent_version,
  ie.event_type,
  ie.success AS install_success,
  ie.created_at AS install_event_at,
  ie.metadata->>'os_version' AS macos_version,
  CASE
    WHEN m.is_stuck THEN '🔴 STUCK'
    WHEN m.has_errors THEN '🟡 ERRORS'
    WHEN m.lifecycle_stage = 'active' THEN '🟢 OK'
    ELSE '⚪ ' || m.lifecycle_stage
  END AS status_emoji
FROM macos_agents m
LEFT JOIN install_events ie
  ON ie.agent_name = m.agent_name
ORDER BY m.enrolled_at DESC;

-- Resultado esperado (exemplo):
-- agent_name        | lifecycle_stage | enrolled_at          | status_emoji
-- ------------------|----------------|---------------------|---------------
-- fs-auditor-macos  | active         | 2025-01-15 10:30:00 | 🟢 OK
-- test-macos-01     | installing     | 2025-01-15 10:25:00 | ⚪ installing


-- Query 3: Agentes Problemáticos (STUCK ou COM ERROS)
-- ============================================
SELECT
  agent_name,
  os_type,
  lifecycle_stage,
  enrolled_at,
  last_heartbeat_at,
  EXTRACT(EPOCH FROM (NOW() - enrolled_at)) / 60 AS minutes_since_enrollment,
  EXTRACT(EPOCH FROM (NOW() - last_heartbeat_at)) / 60 AS minutes_since_heartbeat,
  agent_version,
  CASE
    WHEN is_stuck THEN '🔴 Travado em ' || lifecycle_stage || ' (> 30 min)'
    WHEN has_errors THEN '🟡 Com erros'
    WHEN lifecycle_stage = 'installing' AND enrolled_at < NOW() - INTERVAL '10 minutes' THEN '🟠 Installing muito tempo'
    ELSE '⚪ Indefinido'
  END AS problem_description
FROM v_agent_lifecycle_state
WHERE 
  (is_stuck = true OR has_errors = true OR 
   (lifecycle_stage = 'installing' AND enrolled_at < NOW() - INTERVAL '10 minutes'))
  AND enrolled_at > NOW() - INTERVAL '24 hours'
ORDER BY enrolled_at DESC;

-- Resultado esperado:
-- Se tudo estiver OK, nenhuma linha retornada.
-- Se houver problemas, lista agentes travados/com erros.


-- Query 4: Taxa de Sucesso Global (24h)
-- ============================================
WITH stats AS (
  SELECT
    COUNT(*) AS total_agents,
    COUNT(*) FILTER (WHERE lifecycle_stage = 'active') AS active_agents,
    COUNT(*) FILTER (WHERE is_stuck = true) AS stuck_agents,
    COUNT(*) FILTER (WHERE has_errors = true) AS error_agents
  FROM v_agent_lifecycle_state
  WHERE enrolled_at > NOW() - INTERVAL '24 hours'
)
SELECT
  total_agents,
  active_agents,
  stuck_agents,
  error_agents,
  CASE 
    WHEN total_agents = 0 THEN 0
    ELSE ROUND(100.0 * active_agents / total_agents, 1)
  END AS success_rate_pct,
  CASE
    WHEN total_agents = 0 THEN '⚪ Sem dados'
    WHEN ROUND(100.0 * active_agents / total_agents, 1) >= 95 THEN '🟢 HEALTHY'
    WHEN ROUND(100.0 * active_agents / total_agents, 1) >= 80 THEN '🟡 WARNING'
    ELSE '🔴 CRITICAL'
  END AS health_status
FROM stats;

-- Resultado esperado (exemplo):
-- total_agents | active_agents | stuck | errors | success_rate | health_status
-- -------------|---------------|-------|--------|--------------|---------------
--           38 |            36 |     1 |      1 |         94.7 | 🟡 WARNING

-- ============================================
-- 🎯 CRITÉRIOS DE SUCESSO
-- ============================================
-- ✅ success_rate >= 95% → HEALTHY
-- ⚠️ success_rate >= 80% → WARNING
-- 🚨 success_rate < 80%  → CRITICAL
-- ============================================
