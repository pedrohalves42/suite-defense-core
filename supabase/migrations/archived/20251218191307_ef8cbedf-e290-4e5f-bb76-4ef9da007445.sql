-- ============================================
-- FASE 3: AUTO-ROLLBACK & SAFE MODE
-- Tabela para registrar eventos de rollback
-- ============================================

CREATE TABLE public.agent_rollback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_name text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_version text NOT NULL,
  to_version text NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'health_check_failed', 
    'crash_detected',
    'state_machine_invalid',
    'heartbeat_failed',
    'manual_rollback'
  )),
  rollback_count integer DEFAULT 1,
  safe_mode_triggered boolean DEFAULT false,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indices para queries eficientes
CREATE INDEX idx_rollback_agent ON agent_rollback_events(agent_id, created_at DESC);
CREATE INDEX idx_rollback_tenant ON agent_rollback_events(tenant_id, created_at DESC);
CREATE INDEX idx_rollback_safe_mode ON agent_rollback_events(safe_mode_triggered, created_at DESC) WHERE safe_mode_triggered = true;

-- RLS
ALTER TABLE agent_rollback_events ENABLE ROW LEVEL SECURITY;

-- Tenant members can view rollbacks
CREATE POLICY "tenant_view_rollbacks" ON agent_rollback_events
  FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
  ));

-- Super admins can view all rollbacks
CREATE POLICY "super_admin_view_all_rollbacks" ON agent_rollback_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Comments
COMMENT ON TABLE agent_rollback_events IS 'Registra eventos de rollback automatico de agentes para auditoria e diagnostico';
COMMENT ON COLUMN agent_rollback_events.reason IS 'Motivo do rollback: health_check_failed, crash_detected, state_machine_invalid, heartbeat_failed, manual_rollback';
COMMENT ON COLUMN agent_rollback_events.safe_mode_triggered IS 'True se o agente entrou em safe mode apos multiplos rollbacks';
COMMENT ON COLUMN agent_rollback_events.rollback_count IS 'Contador de rollbacks consecutivos para o mesmo agente';