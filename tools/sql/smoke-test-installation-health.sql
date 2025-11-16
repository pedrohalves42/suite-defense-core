-- ============================================
-- 🔍 SMOKE TEST: Installation Health (24h)
-- ============================================
-- Análise de métricas de instalação:
-- - Taxa de sucesso por platform
-- - Tempo médio de instalação
-- - Erros mais comuns
-- - Agentes com falhas recorrentes

-- Query 1: Taxa de Sucesso por Platform
-- ============================================
SELECT
  platform,
  COUNT(*) AS total_events,
  COUNT(*) FILTER (WHERE success IS TRUE) AS successful,
  COUNT(*) FILTER (WHERE success IS FALSE) AS failed,
  ROUND(
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE 100.0 * COUNT(*) FILTER (WHERE success IS TRUE) / COUNT(*)
    END, 1
  ) AS success_rate_pct,
  CASE
    WHEN COUNT(*) = 0 THEN '⚪ Sem dados'
    WHEN ROUND(100.0 * COUNT(*) FILTER (WHERE success IS TRUE) / COUNT(*), 1) >= 95 THEN '🟢 HEALTHY'
    WHEN ROUND(100.0 * COUNT(*) FILTER (WHERE success IS TRUE) / COUNT(*), 1) >= 80 THEN '🟡 WARNING'
    ELSE '🔴 CRITICAL'
  END AS status
FROM installation_analytics
WHERE event_type IN ('post_installation', 'post_installation_unverified')
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY platform
ORDER BY 
  CASE platform
    WHEN 'macos' THEN 0
    WHEN 'windows' THEN 1
    WHEN 'linux' THEN 2
    ELSE 3
  END;

-- Resultado esperado (exemplo):
-- platform | total_events | successful | failed | success_rate_pct | status
-- ---------|--------------|-----------|--------|-----------------|----------
-- macos    |           10 |        10 |      0 |           100.0 | 🟢 HEALTHY
-- windows  |           25 |        23 |      2 |            92.0 | 🟡 WARNING
-- linux    |            5 |         5 |      0 |           100.0 | 🟢 HEALTHY


-- Query 2: Tempo Médio de Instalação
-- ============================================
SELECT
  platform,
  COUNT(*) FILTER (WHERE installation_time_seconds IS NOT NULL) AS samples,
  ROUND(AVG(installation_time_seconds), 1) AS avg_seconds,
  ROUND(MIN(installation_time_seconds), 1) AS min_seconds,
  ROUND(MAX(installation_time_seconds), 1) AS max_seconds,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY installation_time_seconds), 1) AS median_seconds,
  CASE
    WHEN AVG(installation_time_seconds) < 60 THEN '🟢 Rápido (< 1min)'
    WHEN AVG(installation_time_seconds) < 120 THEN '🟡 Normal (1-2min)'
    ELSE '🔴 Lento (> 2min)'
  END AS speed_status
FROM installation_analytics
WHERE event_type IN ('post_installation', 'post_installation_unverified')
  AND created_at > NOW() - INTERVAL '24 hours'
  AND installation_time_seconds IS NOT NULL
GROUP BY platform
ORDER BY avg_seconds DESC;

-- Resultado esperado (exemplo):
-- platform | samples | avg_seconds | min | max | median | speed_status
-- ---------|---------|------------|-----|-----|--------|---------------
-- windows  |      23 |        45.2 |  30 |  90 |   42.0 | 🟢 Rápido
-- macos    |      10 |        38.5 |  25 |  55 |   37.0 | 🟢 Rápido
-- linux    |       5 |        52.1 |  40 |  70 |   50.0 | 🟢 Rápido


-- Query 3: Top 5 Erros Mais Comuns
-- ============================================
SELECT
  platform,
  error_message,
  COUNT(*) AS occurrences,
  ARRAY_AGG(DISTINCT agent_name ORDER BY agent_name) AS affected_agents,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen
FROM installation_analytics
WHERE event_type IN ('post_installation', 'post_installation_unverified')
  AND success IS FALSE
  AND error_message IS NOT NULL
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY platform, error_message
ORDER BY occurrences DESC, last_seen DESC
LIMIT 5;

-- Resultado esperado:
-- Se tudo estiver OK, nenhuma linha retornada.
-- Se houver erros, lista os mais frequentes.

-- Exemplo de saída (com erros):
-- platform | error_message              | occurrences | affected_agents
-- ---------|---------------------------|-------------|------------------
-- windows  | HMAC verification failed  |           2 | {agent-01, agent-02}
-- macos    | Network timeout           |           1 | {test-macos}


-- Query 4: Agentes com Falhas Recorrentes (> 1 falha)
-- ============================================
SELECT
  agent_name,
  platform,
  COUNT(*) AS total_attempts,
  COUNT(*) FILTER (WHERE success IS TRUE) AS successful,
  COUNT(*) FILTER (WHERE success IS FALSE) AS failed,
  ARRAY_AGG(error_message) FILTER (WHERE error_message IS NOT NULL) AS error_messages,
  MIN(created_at) AS first_attempt,
  MAX(created_at) AS last_attempt,
  CASE
    WHEN COUNT(*) FILTER (WHERE success IS FALSE) >= 3 THEN '🔴 CRITICAL (≥3 falhas)'
    WHEN COUNT(*) FILTER (WHERE success IS FALSE) >= 2 THEN '🟡 WARNING (2 falhas)'
    ELSE '🟠 1 falha'
  END AS severity
FROM installation_analytics
WHERE event_type IN ('post_installation', 'post_installation_unverified')
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_name, platform
HAVING COUNT(*) FILTER (WHERE success IS FALSE) > 0
ORDER BY failed DESC, last_attempt DESC;

-- Resultado esperado:
-- Se tudo estiver OK, nenhuma linha retornada.
-- Se houver falhas recorrentes, investigue esses agentes.


-- Query 5: Distribuição Temporal de Instalações (últimas 24h)
-- ============================================
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  platform,
  COUNT(*) AS events,
  COUNT(*) FILTER (WHERE success IS TRUE) AS successful,
  COUNT(*) FILTER (WHERE success IS FALSE) AS failed,
  ROUND(
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE 100.0 * COUNT(*) FILTER (WHERE success IS TRUE) / COUNT(*)
    END, 0
  ) AS success_rate_pct
FROM installation_analytics
WHERE event_type IN ('post_installation', 'post_installation_unverified')
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), platform
ORDER BY hour DESC, platform;

-- Resultado esperado (exemplo):
-- hour                 | platform | events | successful | failed | success_rate
-- ---------------------|----------|--------|-----------|--------|---------------
-- 2025-01-15 10:00:00 | macos    |      5 |         5 |      0 | 100
-- 2025-01-15 10:00:00 | windows  |     12 |        11 |      1 |  92
-- 2025-01-15 09:00:00 | macos    |      3 |         3 |      0 | 100


-- Query 6: Network Connectivity Issues
-- ============================================
SELECT
  platform,
  COUNT(*) FILTER (WHERE network_connectivity IS FALSE) AS no_connectivity,
  COUNT(*) FILTER (WHERE network_connectivity IS TRUE) AS with_connectivity,
  ROUND(
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE 100.0 * COUNT(*) FILTER (WHERE network_connectivity IS FALSE) / COUNT(*)
    END, 1
  ) AS pct_no_connectivity
FROM installation_analytics
WHERE event_type IN ('post_installation', 'post_installation_unverified')
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY platform
HAVING COUNT(*) FILTER (WHERE network_connectivity IS FALSE) > 0
ORDER BY pct_no_connectivity DESC;

-- Resultado esperado:
-- Se não houver problemas de rede, nenhuma linha retornada.
-- Se houver, mostra quais platforms têm mais problemas de conectividade.


-- ============================================
-- 🎯 RESUMO EXECUTIVO
-- ============================================
WITH summary AS (
  SELECT
    COUNT(*) AS total_installations,
    COUNT(*) FILTER (WHERE success IS TRUE) AS successful,
    COUNT(*) FILTER (WHERE success IS FALSE) AS failed,
    COUNT(DISTINCT agent_name) AS unique_agents,
    COUNT(DISTINCT agent_name) FILTER (WHERE success IS TRUE) AS agents_installed_ok,
    ROUND(AVG(installation_time_seconds), 1) AS avg_time_sec
  FROM installation_analytics
  WHERE event_type IN ('post_installation', 'post_installation_unverified')
    AND created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  total_installations,
  successful,
  failed,
  ROUND(100.0 * successful / NULLIF(total_installations, 0), 1) AS success_rate_pct,
  unique_agents,
  agents_installed_ok,
  avg_time_sec,
  CASE
    WHEN total_installations = 0 THEN '⚪ Sem instalações nas últimas 24h'
    WHEN ROUND(100.0 * successful / total_installations, 1) >= 95 THEN '🟢 SISTEMA HEALTHY'
    WHEN ROUND(100.0 * successful / total_installations, 1) >= 80 THEN '🟡 ATENÇÃO: Taxa de sucesso abaixo do ideal'
    ELSE '🔴 CRÍTICO: Problemas graves de instalação'
  END AS overall_health
FROM summary;

-- ============================================
-- 📊 Como Interpretar os Resultados
-- ============================================
-- 🟢 success_rate >= 95%  → Sistema funcionando normalmente
-- 🟡 success_rate >= 80%  → Investigar causas de falha
-- 🔴 success_rate < 80%   → Problema crítico, parar deploys
--
-- 🚨 ALERTAS CRÍTICOS:
-- - Agentes com ≥3 falhas → Verificar enrollment_key / HMAC
-- - Tempo médio > 2min   → Investigar performance de rede/servidor
-- - Muitos "no connectivity" → Problema de firewall/DNS
-- ============================================
