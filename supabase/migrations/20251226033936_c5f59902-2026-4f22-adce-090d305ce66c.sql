-- =============================================
-- FASE 1 + FASE 2: Sistema de Acao Automatica com Motor de Risco
-- =============================================

-- ? CORRECAO CRITICA DE SEGURANCA
-- Playbook "DNS bloqueou" tem acao destrutiva (isolate), deve requerer aprovacao
UPDATE playbooks 
SET require_approval = true, updated_at = NOW()
WHERE id = 'a2000000-0000-0000-0000-000000000002';

-- =============================================
-- FASE 1.1: Auto-Execucao Segura de Playbooks
-- =============================================

-- Garantir require_approval = true para TODOS playbooks com acoes destrutivas
UPDATE playbooks p
SET require_approval = true, updated_at = NOW()
WHERE p.id IN (
  SELECT DISTINCT pb.id
  FROM playbooks pb
  JOIN playbook_actions pa ON pa.playbook_id = pb.id
  WHERE pa.action_type IN ('isolate', 'kill_process', 'stop_service', 'disable_service', 'revoke_token', 'quarantine', 'network_isolate')
)
AND require_approval = false;

-- Auto-execucao APENAS para playbooks com TODAS as acoes nao-destrutivas
UPDATE playbooks p
SET require_approval = false, updated_at = NOW()
WHERE p.id IN (
  SELECT pb.id
  FROM playbooks pb
  JOIN playbook_actions pa ON pa.playbook_id = pb.id
  GROUP BY pb.id
  HAVING bool_and(pa.action_type IN ('notify', 'generate_report', 'create_job', 'escalate', 'log_evidence', 'create_evidence'))
)
AND p.is_enabled = true;

-- =============================================
-- FASE 1.2: Colunas para Rastreio de Auto-Execucao
-- =============================================

ALTER TABLE playbook_executions 
ADD COLUMN IF NOT EXISTS auto_executed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS risk_score NUMERIC(4,3),
ADD COLUMN IF NOT EXISTS triggered_by TEXT DEFAULT 'user';

-- Indice para consultas de auditoria
CREATE INDEX IF NOT EXISTS idx_playbook_executions_auto_executed 
ON playbook_executions(auto_executed) WHERE auto_executed = true;

-- =============================================
-- FASE 1.2: Funcao should_auto_quarantine
-- =============================================

CREATE OR REPLACE FUNCTION should_auto_quarantine(
  p_tenant_id UUID,
  p_context JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  -- Buscar configuracao do tenant
  SELECT enable_auto_quarantine INTO v_enabled
  FROM tenant_settings
  WHERE tenant_id = p_tenant_id;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN false;
  END IF;

  -- Criterios para auto-quarentena
  IF (p_context->>'threat_level')::INT >= 8 THEN
    RETURN true;
  END IF;

  IF p_context->>'verdict' = 'malicious' THEN
    RETURN true;
  END IF;

  IF (p_context->>'positives')::INT >= 5 THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- =============================================
-- FASE 2: Tabela de Scoring de Risco
-- =============================================

CREATE TABLE IF NOT EXISTS event_risk_scoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL UNIQUE,
  severity_base NUMERIC(4,3) NOT NULL CHECK (severity_base BETWEEN 0 AND 1),
  auto_action_threshold NUMERIC(4,3) DEFAULT 0.8 CHECK (auto_action_threshold BETWEEN 0 AND 1),
  risk_multipliers JSONB DEFAULT '{}',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para event_risk_scoring
ALTER TABLE event_risk_scoring ENABLE ROW LEVEL SECURITY;

-- Politicas RLS
CREATE POLICY "Admins can view event_risk_scoring" ON event_risk_scoring
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Service role full access to event_risk_scoring" ON event_risk_scoring
  FOR ALL USING (auth.role() = 'service_role');

-- Dados iniciais de scoring
INSERT INTO event_risk_scoring (event_type, severity_base, auto_action_threshold, description)
VALUES
  ('agent_offline', 0.4, 0.9, 'Agente offline por periodo prolongado'),
  ('dns_blocked', 0.6, 0.85, 'Multiplas tentativas de DNS bloqueado'),
  ('job_failed', 0.5, 0.8, 'Job critico falhou repetidamente'),
  ('integrity_low', 0.7, 0.75, 'Integridade do agente comprometida'),
  ('malware_detected', 0.9, 0.7, 'Malware detectado por antivirus'),
  ('suspicious_process', 0.8, 0.75, 'Processo suspeito detectado'),
  ('unauthorized_service', 0.7, 0.8, 'Servico nao autorizado')
ON CONFLICT (event_type) DO NOTHING;

-- =============================================
-- FASE 2: Funcao calculate_event_risk
-- =============================================

CREATE OR REPLACE FUNCTION calculate_event_risk(
  p_event_type TEXT,
  p_context JSONB
) RETURNS NUMERIC
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_base NUMERIC;
  v_score NUMERIC;
BEGIN
  -- Buscar configuracao do evento
  SELECT severity_base INTO v_base
  FROM event_risk_scoring
  WHERE event_type = p_event_type AND is_active = true;

  IF v_base IS NULL THEN
    RETURN 0.5; -- Default medio para eventos desconhecidos
  END IF;

  v_score := v_base;

  -- Multiplicador: repeticao
  IF (p_context->>'repeat_count') IS NOT NULL THEN
    v_score := v_score + LEAST((p_context->>'repeat_count')::NUMERIC * 0.03, 0.2);
  END IF;

  -- Multiplicador: criticidade do agente
  IF p_context->>'agent_criticality' = 'high' THEN
    v_score := v_score + 0.1;
  ELSIF p_context->>'agent_criticality' = 'critical' THEN
    v_score := v_score + 0.15;
  END IF;

  -- Multiplicador: horario fora do expediente
  IF p_context->>'outside_business_hours' = 'true' THEN
    v_score := v_score + 0.05;
  END IF;

  -- Multiplicador: historico de incidentes
  IF (p_context->>'previous_incidents')::INT > 0 THEN
    v_score := v_score + LEAST((p_context->>'previous_incidents')::NUMERIC * 0.02, 0.1);
  END IF;

  RETURN LEAST(v_score, 1.0);
END;
$$;

-- =============================================
-- FASE 2: Funcao should_auto_execute_playbook
-- =============================================

CREATE OR REPLACE FUNCTION should_auto_execute_playbook(
  p_playbook_id UUID,
  p_event_type TEXT,
  p_context JSONB
) RETURNS JSONB
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_risk_score NUMERIC;
  v_threshold NUMERIC;
  v_require_approval BOOLEAN;
  v_has_destructive_actions BOOLEAN;
  v_is_enabled BOOLEAN;
BEGIN
  -- Calcular risk score
  v_risk_score := calculate_event_risk(p_event_type, p_context);
  
  -- Buscar threshold do evento
  SELECT auto_action_threshold INTO v_threshold
  FROM event_risk_scoring
  WHERE event_type = p_event_type AND is_active = true;
  
  IF v_threshold IS NULL THEN
    v_threshold := 0.8; -- Default conservador
  END IF;
  
  -- Verificar se playbook tem acoes destrutivas
  SELECT EXISTS(
    SELECT 1 FROM playbook_actions
    WHERE playbook_id = p_playbook_id
    AND action_type IN ('isolate', 'kill_process', 'stop_service', 'disable_service', 'revoke_token', 'quarantine', 'network_isolate')
  ) INTO v_has_destructive_actions;
  
  -- Verificar configuracao do playbook
  SELECT require_approval, is_enabled 
  INTO v_require_approval, v_is_enabled
  FROM playbooks WHERE id = p_playbook_id;
  
  -- Decisao final: auto-execute se:
  -- 1. Playbook esta ativo
  -- 2. Nao tem acoes destrutivas
  -- 3. Nao requer aprovacao
  -- 4. Risk score >= threshold
  RETURN jsonb_build_object(
    'risk_score', ROUND(v_risk_score, 3),
    'threshold', ROUND(v_threshold, 3),
    'should_auto_execute', (
      v_is_enabled 
      AND v_risk_score >= v_threshold 
      AND NOT v_has_destructive_actions 
      AND NOT COALESCE(v_require_approval, true)
    ),
    'has_destructive_actions', v_has_destructive_actions,
    'require_approval', COALESCE(v_require_approval, true),
    'is_enabled', COALESCE(v_is_enabled, false),
    'decision_reason', CASE
      WHEN NOT COALESCE(v_is_enabled, false) THEN 'playbook_disabled'
      WHEN v_has_destructive_actions THEN 'blocked_destructive_action'
      WHEN COALESCE(v_require_approval, true) THEN 'requires_manual_approval'
      WHEN v_risk_score < v_threshold THEN 'below_risk_threshold'
      ELSE 'auto_execute_approved'
    END
  );
END;
$$;