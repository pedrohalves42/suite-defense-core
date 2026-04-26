-- FASE 1: Adicionar 'stuck_installations' ao CHECK constraint
ALTER TABLE system_alerts DROP CONSTRAINT IF EXISTS system_alerts_alert_type_check;
ALTER TABLE system_alerts ADD CONSTRAINT system_alerts_alert_type_check 
  CHECK (alert_type IN (
    'agent_offline', 'high_cpu', 'high_memory', 'high_disk', 
    'job_failed', 'security_threat', 'memory_warning', 'ai_insight_alert',
    'blocked_access_pattern', 'job_integrity_violation', 'safe_mode_auto',
    'agent_divergent', 'progressive_degradation', 'pending_agents',
    'non_execution_detected', 'stuck_installations', 'agent_integrity_failure'
  ));

-- FASE 2: RLS para agent_releases - permitir leitura para usuarios autenticados
CREATE POLICY "agent_releases_select_authenticated" 
ON agent_releases FOR SELECT 
TO authenticated 
USING (is_active = true);

-- FASE 3: Corrigir funcao collect_task_evidence (a.status -> a.resolved)
CREATE OR REPLACE FUNCTION public.collect_task_evidence(p_agent_id uuid, p_task_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evidence jsonb := '{}'::jsonb;
  v_related_alerts jsonb;
  v_related_insights jsonb;
  v_agent_metrics jsonb;
BEGIN
  -- Coletar alertas relacionados
  SELECT jsonb_agg(jsonb_build_object(
    'id', a.id,
    'alert_type', a.alert_type,
    'severity', a.severity,
    'message', a.message,
    'resolved', a.resolved,
    'created_at', a.created_at
  ))
  INTO v_related_alerts
  FROM system_alerts a
  WHERE a.agent_id = p_agent_id
    AND a.created_at > NOW() - INTERVAL '24 hours'
  LIMIT 10;

  -- Coletar insights relacionados
  SELECT jsonb_agg(jsonb_build_object(
    'id', i.id,
    'insight_type', i.insight_type,
    'severity', i.severity,
    'title', i.title,
    'acknowledged', i.acknowledged,
    'created_at', i.created_at
  ))
  INTO v_related_insights
  FROM ai_insights i
  WHERE i.agent_id = p_agent_id
    AND i.created_at > NOW() - INTERVAL '24 hours'
  LIMIT 10;

  -- Coletar metricas recentes do agente
  SELECT jsonb_build_object(
    'cpu_usage_percent', m.cpu_usage_percent,
    'memory_usage_percent', m.memory_usage_percent,
    'disk_usage_percent', m.disk_usage_percent,
    'collected_at', m.collected_at
  )
  INTO v_agent_metrics
  FROM agent_system_metrics m
  WHERE m.agent_id = p_agent_id
  ORDER BY m.collected_at DESC
  LIMIT 1;

  -- Montar evidencia completa
  v_evidence := jsonb_build_object(
    'task_type', p_task_type,
    'agent_id', p_agent_id,
    'collected_at', NOW(),
    'related_alerts', COALESCE(v_related_alerts, '[]'::jsonb),
    'related_insights', COALESCE(v_related_insights, '[]'::jsonb),
    'agent_metrics', COALESCE(v_agent_metrics, '{}'::jsonb)
  );

  RETURN v_evidence;
END;
$$;

-- FASE 4: Corrigir funcao check_offline_agents_for_playbook
CREATE OR REPLACE FUNCTION public.check_offline_agents_for_playbook(p_tenant_id uuid)
RETURNS TABLE(agent_id uuid, agent_name text, last_heartbeat timestamptz, minutes_offline integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id AS agent_id,
    a.agent_name,
    a.last_heartbeat,
    EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::integer / 60 AS minutes_offline
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
    AND a.archived_at IS NULL
    AND a.status = 'active'
    AND a.last_heartbeat < NOW() - INTERVAL '15 minutes';
END;
$$;