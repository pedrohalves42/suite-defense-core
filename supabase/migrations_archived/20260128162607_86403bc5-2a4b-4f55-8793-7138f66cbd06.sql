-- P1: Criar trigger para auto-resolucao de alertas na tabela agent_system_metrics
DROP TRIGGER IF EXISTS tr_auto_resolve_resource_alerts ON agent_system_metrics;
CREATE TRIGGER tr_auto_resolve_resource_alerts
  AFTER INSERT ON agent_system_metrics
  FOR EACH ROW
  EXECUTE FUNCTION auto_resolve_resource_alerts();

-- P2: Criar view de saude dos ciclos do sistema
CREATE OR REPLACE VIEW v_system_cycle_health AS
SELECT 
  'ai_actions_pending_verification' as cycle,
  COUNT(*) as pending_count,
  MIN(executed_at) as oldest_pending
FROM ai_actions
WHERE effectiveness_status = 'pending' AND status = 'executed'
UNION ALL
SELECT 
  'insights_without_action' as cycle,
  COUNT(*) as pending_count,
  MIN(i.created_at) as oldest_pending
FROM ai_insights i
LEFT JOIN ai_actions a ON a.insight_id = i.id
WHERE i.severity IN ('critical', 'high')
  AND i.acknowledged = false
  AND a.id IS NULL
  AND i.created_at > NOW() - INTERVAL '7 days'
UNION ALL
SELECT 
  'unresolved_alerts' as cycle,
  COUNT(*) as pending_count,
  MIN(created_at) as oldest_pending
FROM system_alerts
WHERE resolved_at IS NULL
  AND created_at < NOW() - INTERVAL '24 hours'
UNION ALL
SELECT 
  'orphan_pending_jobs' as cycle,
  COUNT(*) as pending_count,
  MIN(created_at) as oldest_pending
FROM jobs
WHERE status = 'pending'
  AND expires_at < NOW();