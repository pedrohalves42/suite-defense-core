-- Fase 1: Criar tabela ai_action_logs
CREATE TABLE IF NOT EXISTS public.ai_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_data JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_logs_status ON ai_action_logs(status);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_type ON ai_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_tenant ON ai_action_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_created ON ai_action_logs(created_at DESC);

ALTER TABLE ai_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_action_logs_tenant_isolation" ON ai_action_logs;
CREATE POLICY "ai_action_logs_tenant_isolation" ON ai_action_logs
  FOR ALL USING (user_belongs_to_tenant(tenant_id));

-- Fase 2: Funcao para sincronizar agent_state
CREATE OR REPLACE FUNCTION public.sync_agent_state_from_heartbeat()
RETURNS TABLE(agents_updated INTEGER, agent_ids UUID[])
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  updated_count INTEGER := 0;
  updated_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  WITH updated AS (
    UPDATE agents SET 
      agent_state = 'offline',
      agent_state_reason = 'Sem heartbeat ha mais de 24 horas (sync automatico)',
      agent_state_changed_at = NOW(),
      offline_reason = 'heartbeat_timeout',
      offline_detected_at = COALESCE(offline_detected_at, NOW())
    WHERE archived_at IS NULL
      AND agent_state NOT IN ('offline', 'archived', 'decommissioned')
      AND last_heartbeat < NOW() - INTERVAL '24 hours'
    RETURNING id
  )
  SELECT COUNT(*), ARRAY_AGG(id) INTO updated_count, updated_ids FROM updated;
  RETURN QUERY SELECT updated_count, COALESCE(updated_ids, ARRAY[]::UUID[]);
END;
$$;

-- Fase 3: Trigger para auto-resolver alertas
CREATE OR REPLACE FUNCTION public.auto_resolve_resource_alerts()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cpu_usage_percent IS NOT NULL AND NEW.cpu_usage_percent < 90 THEN
    UPDATE system_alerts SET resolved = true, resolved_at = NOW(), 
      resolution_notes = format('Auto-resolvido: CPU normalizada para %.1f%%', NEW.cpu_usage_percent)
    WHERE (details->>'agent_id')::uuid = NEW.agent_id
      AND alert_type IN ('high_cpu', 'resource_high_cpu') AND resolved = false;
  END IF;
  IF NEW.memory_usage_percent IS NOT NULL AND NEW.memory_usage_percent < 90 THEN
    UPDATE system_alerts SET resolved = true, resolved_at = NOW(), 
      resolution_notes = format('Auto-resolvido: Memoria normalizada para %.1f%%', NEW.memory_usage_percent)
    WHERE (details->>'agent_id')::uuid = NEW.agent_id
      AND alert_type IN ('high_memory', 'resource_high_memory') AND resolved = false;
  END IF;
  IF NEW.disk_usage_percent IS NOT NULL AND NEW.disk_usage_percent < 90 THEN
    UPDATE system_alerts SET resolved = true, resolved_at = NOW(), 
      resolution_notes = format('Auto-resolvido: Disco normalizado para %.1f%%', NEW.disk_usage_percent)
    WHERE (details->>'agent_id')::uuid = NEW.agent_id
      AND alert_type IN ('high_disk', 'resource_high_disk') AND resolved = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_auto_resolve_resource_alerts ON agent_system_metrics;
CREATE TRIGGER tr_auto_resolve_resource_alerts
AFTER INSERT ON agent_system_metrics
FOR EACH ROW EXECUTE FUNCTION public.auto_resolve_resource_alerts();