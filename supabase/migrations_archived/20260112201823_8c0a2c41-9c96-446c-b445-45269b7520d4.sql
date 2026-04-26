-- FASE 1.1: Desativar cron job duplicado que causa 401
SELECT cron.unschedule('monitor-thresholds-every-5-minutes');

-- FASE 1.2: Atualizar CHECK constraint para incluir non_execution_detected
ALTER TABLE system_alerts DROP CONSTRAINT IF EXISTS system_alerts_alert_type_check;
ALTER TABLE system_alerts ADD CONSTRAINT system_alerts_alert_type_check 
  CHECK (alert_type IN (
    'agent_offline', 'high_cpu', 'high_memory', 'high_disk', 
    'job_failed', 'security_threat', 'memory_warning', 'ai_insight_alert',
    'blocked_access_pattern', 'job_integrity_violation', 'safe_mode_auto',
    'agent_divergent', 'progressive_degradation', 'pending_agents',
    'non_execution_detected'
  ));

-- FASE 2: Dropar e recriar view v_agent_execution_health
DROP VIEW IF EXISTS v_agent_execution_health;

CREATE VIEW v_agent_execution_health AS
SELECT 
  a.id AS agent_id,
  a.tenant_id,
  a.agent_name,
  a.status,
  a.last_heartbeat,
  a.agent_mode,
  a.agent_version,
  EXTRACT(epoch FROM (NOW() - a.last_heartbeat))/60 AS minutes_since_heartbeat,
  (SELECT MAX(je.finished_at) FROM job_executions je WHERE je.agent_id = a.id) AS last_execution_at,
  EXTRACT(epoch FROM (NOW() - (
    SELECT MAX(je.finished_at) FROM job_executions je WHERE je.agent_id = a.id
  )))/60 AS minutes_since_execution,
  (SELECT COUNT(*) FROM jobs WHERE agent_id = a.id 
   AND status = 'queued' AND created_at < NOW() - INTERVAL '30 minutes') AS stale_queued_jobs,
  (SELECT COUNT(*) FROM jobs WHERE agent_id = a.id 
   AND status = 'delivered' AND delivered_at < NOW() - INTERVAL '60 minutes') AS stale_delivered_jobs,
  (SELECT COUNT(*) FROM jobs WHERE agent_id = a.id 
   AND status IN ('queued', 'delivered')) AS pending_jobs,
  CASE 
    WHEN a.agent_mode = 'safe_mode' THEN 'safe_mode'
    WHEN a.status = 'offline' THEN 'offline'
    WHEN a.last_heartbeat IS NULL THEN 'never_connected'
    WHEN a.last_heartbeat < NOW() - INTERVAL '15 minutes' THEN 'offline'
    ELSE 'healthy'
  END AS health_status,
  CASE 
    WHEN a.agent_mode = 'safe_mode' THEN 'high'
    WHEN a.status = 'offline' OR a.last_heartbeat < NOW() - INTERVAL '15 minutes' THEN 'critical'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'medium'
    ELSE 'low'
  END AS severity,
  'Agent health check' AS health_description,
  NOW() AS checked_at
FROM agents a
WHERE a.archived_at IS NULL;