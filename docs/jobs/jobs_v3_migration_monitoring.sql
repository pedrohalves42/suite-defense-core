-- ============================================================
-- Jobs v3 Migration Monitoring Queries
-- ============================================================
-- 
-- Use estas queries para monitorar a adocao da migracao de Jobs v1 para v3
-- Jobs v1: usam ack-job, status='done', output IS NULL
-- Jobs v3: usam submit-job-result, status='completed'/'failed', output IS NOT NULL
--
-- Autor: CyberShield Team
-- Data: 2025-11-19
-- ============================================================

-- 1?? Taxa de adocao v3 (ultimos 7 dias) - Evolucao diaria
-- Mostra quantos jobs foram criados por dia e qual % usou v3
SELECT 
  DATE(created_at) AS date,
  COUNT(*) FILTER (WHERE output IS NOT NULL) AS jobs_v3,
  COUNT(*) FILTER (WHERE output IS NULL) AS jobs_v1,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE output IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS pct_v3
FROM jobs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 2?? Agentes ainda usando v1 (ultimos 3 dias)
-- Identifica quais agentes ainda nao migraram para v3
SELECT 
  agent_name,
  COUNT(*) FILTER (WHERE output IS NULL) AS v1_jobs,
  COUNT(*) FILTER (WHERE output IS NOT NULL) AS v3_jobs,
  MAX(created_at) FILTER (WHERE output IS NULL) AS last_v1_job,
  MAX(created_at) FILTER (WHERE output IS NOT NULL) AS last_v3_job,
  CASE 
    WHEN COUNT(*) FILTER (WHERE output IS NOT NULL) = 0 THEN '[ERROR]  NUNCA usou v3'
    WHEN COUNT(*) FILTER (WHERE output IS NULL) > COUNT(*) FILTER (WHERE output IS NOT NULL) THEN '[WARN] ? Usa MAIS v1 que v3'
    ELSE '[OK]  Usa MAIS v3 que v1'
  END AS status
FROM jobs
WHERE created_at > NOW() - INTERVAL '3 days'
GROUP BY agent_name
HAVING COUNT(*) FILTER (WHERE output IS NULL) > 0
ORDER BY last_v1_job DESC;

-- 3?? Recomendacao de deprecacao de ack-job
-- Analisa se e seguro deprecar o endpoint ack-job
WITH stats AS (
  SELECT 
    COUNT(*) FILTER (WHERE output IS NOT NULL) AS v3_count,
    COUNT(*) AS total
  FROM jobs
  WHERE created_at > NOW() - INTERVAL '7 days'
)
SELECT
  v3_count AS jobs_v3_last_7_days,
  total AS total_jobs_last_7_days,
  ROUND(100.0 * v3_count / NULLIF(total, 0), 1) AS adoption_pct,
  CASE 
    WHEN total = 0 THEN '?? No jobs in last 7 days - Cannot recommend'
    WHEN ROUND(100.0 * v3_count / total, 1) >= 95 THEN '[OK]  SAFE TO DEPRECATE ack-job'
    WHEN ROUND(100.0 * v3_count / total, 1) >= 80 THEN '[WARN] ? CAUTION - Almost ready (>80%)'
    WHEN ROUND(100.0 * v3_count / total, 1) >= 50 THEN '? WAIT - Test more before deprecating (>50%)'
    ELSE '[ERROR]  NOT READY - Still < 50% adoption'
  END AS recommendation,
  CASE 
    WHEN total = 0 THEN 'Aguardar atividade de jobs'
    WHEN ROUND(100.0 * v3_count / total, 1) >= 95 THEN 'Pode deprecar ack-job com seguranca'
    WHEN ROUND(100.0 * v3_count / total, 1) >= 80 THEN 'Comunicar deprecacao em 2 semanas'
    WHEN ROUND(100.0 * v3_count / total, 1) >= 50 THEN 'Identificar agentes v1 e atualizar'
    ELSE 'Validar implementacao de Submit-JobResult nos agentes'
  END AS next_steps
FROM stats;

-- 4?? Jobs v3 com erro (diagnostico) - Ultimas 24h
-- Identifica problemas na implementacao v3
SELECT 
  id,
  agent_name,
  type,
  status,
  error_message,
  execution_time_seconds,
  created_at,
  started_at,
  finished_at,
  (EXTRACT(EPOCH FROM (finished_at - started_at)))::INTEGER AS actual_duration_seconds
FROM jobs
WHERE output IS NOT NULL
  AND status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 5?? Performance de Jobs v3 - Tempo medio de execucao por tipo
-- Analisa a performance dos diferentes tipos de jobs v3
SELECT 
  type AS job_type,
  COUNT(*) AS total_jobs,
  ROUND(AVG(execution_time_seconds), 1) AS avg_execution_time_seconds,
  MIN(execution_time_seconds) AS min_execution_time_seconds,
  MAX(execution_time_seconds) AS max_execution_time_seconds,
  COUNT(*) FILTER (WHERE status = 'completed') AS successful_jobs,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_jobs,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0), 1) AS success_rate_pct
FROM jobs
WHERE output IS NOT NULL
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY type
ORDER BY total_jobs DESC;

-- 6?? Comparacao v1 vs v3 - Ultima semana
-- Resumo executivo da migracao
WITH v1_stats AS (
  SELECT 
    COUNT(*) AS v1_total,
    COUNT(*) FILTER (WHERE status = 'done') AS v1_completed,
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))::INTEGER AS v1_avg_duration
  FROM jobs
  WHERE output IS NULL
    AND created_at > NOW() - INTERVAL '7 days'
),
v3_stats AS (
  SELECT 
    COUNT(*) AS v3_total,
    COUNT(*) FILTER (WHERE status = 'completed') AS v3_completed,
    AVG(execution_time_seconds)::INTEGER AS v3_avg_duration
  FROM jobs
  WHERE output IS NOT NULL
    AND created_at > NOW() - INTERVAL '7 days'
)
SELECT 
  v1_total AS "Jobs v1 (ack-job)",
  v1_completed AS "Jobs v1 Completed",
  v1_avg_duration AS "v1 Avg Duration (sec)",
  v3_total AS "Jobs v3 (submit-job-result)",
  v3_completed AS "Jobs v3 Completed", 
  v3_avg_duration AS "v3 Avg Duration (sec)",
  v1_total + v3_total AS "Total Jobs",
  ROUND(100.0 * v3_total / NULLIF(v1_total + v3_total, 0), 1) AS "v3 Adoption %"
FROM v1_stats, v3_stats;

-- 7?? Diagnostico de agentes sem output (podem precisar atualizacao)
-- Identifica agentes que nunca enviaram resultado v3
SELECT 
  a.agent_name,
  a.status AS agent_status,
  a.agent_version,
  a.last_heartbeat,
  COUNT(j.id) AS total_jobs,
  COUNT(*) FILTER (WHERE j.output IS NOT NULL) AS v3_jobs,
  MAX(j.created_at) AS last_job_created
FROM agents a
LEFT JOIN jobs j ON j.agent_name = a.agent_name AND j.created_at > NOW() - INTERVAL '7 days'
WHERE a.status = 'active'
GROUP BY a.agent_name, a.status, a.agent_version, a.last_heartbeat
HAVING COUNT(j.id) > 0 AND COUNT(*) FILTER (WHERE j.output IS NOT NULL) = 0
ORDER BY total_jobs DESC;

-- ============================================================
-- COMO USAR ESTAS QUERIES
-- ============================================================
--
-- 1. Copie e cole no SQL Editor do Supabase
-- 2. Execute individualmente cada query conforme necessario
-- 3. Monitore a adocao v3 semanalmente
-- 4. Quando atingir >95% de adocao por 2 semanas: deprecar ack-job
--
-- CRONOGRAMA SUGERIDO:
-- Semana 1-2: Monitorar adocao inicial (esperado: 10-30%)
-- Semana 3-4: Identificar agentes v1, atualizar scripts
-- Semana 5-6: Validar >80% adocao
-- Semana 7+: Se >95%, comunicar deprecacao de ack-job
--
-- ============================================================
