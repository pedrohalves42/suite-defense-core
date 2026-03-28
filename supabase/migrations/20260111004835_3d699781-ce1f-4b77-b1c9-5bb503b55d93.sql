-- =====================================================
-- FASE 6: Resiliencia, Contratos e Prevencao de Regressao
-- + Correcoes CRITICAL-005/006
-- =====================================================

-- 1. CRITICAL-005: DROP e recriar view com novas colunas
DROP VIEW IF EXISTS v_agent_lifecycle_state;

CREATE VIEW v_agent_lifecycle_state AS
SELECT
  a.id AS agent_id,
  a.tenant_id,
  a.agent_name,
  a.agent_state,
  a.agent_state_reason,
  a.agent_state_changed_at,
  a.is_isolated,
  a.isolation_reason,
  a.isolated_at,
  a.requires_revalidation,
  a.revalidation_reason,
  a.revalidation_required_at,
  a.safe_mode_entered_at,
  a.safe_mode_reason,
  a.force_update_version,
  a.force_update_reason,
  a.force_update_at,
  a.last_forced_update_applied,
  a.last_heartbeat,
  CASE
    WHEN a.agent_state = 'offline' 
         AND a.last_heartbeat < NOW() - INTERVAL '30 minutes'
         AND EXISTS (
           SELECT 1 FROM enrollment_keys ek 
           WHERE ek.tenant_id = a.tenant_id 
           AND ek.is_active = true
           AND ek.created_at > NOW() - INTERVAL '24 hours'
         )
    THEN 'stuck_installation'
    WHEN a.agent_state = 'degraded' THEN 'degraded'
    WHEN a.agent_state = 'offline' THEN 'offline'
    WHEN a.agent_state = 'healthy' THEN 'healthy'
    ELSE 'unknown'
  END AS lifecycle_status,
  CASE
    WHEN a.agent_state = 'offline' 
         AND a.last_heartbeat < NOW() - INTERVAL '30 minutes'
    THEN TRUE
    ELSE FALSE
  END AS is_stuck
FROM agents a
WHERE a.status = 'active';

COMMENT ON VIEW v_agent_lifecycle_state IS 'View de estado do ciclo de vida dos agents - inclui is_stuck para detect-stuck-installations';

-- 2. View de Contratos Canonicos (Fase 6.1)
DROP VIEW IF EXISTS v_system_contracts;
CREATE VIEW v_system_contracts AS
SELECT 'task_source_type' AS contract, 
       unnest(ARRAY['ai_insight', 'system_alert', 'playbook_execution', 
                    'red_team', 'manual', 'job', 'dlq']) AS value
UNION ALL
SELECT 'job_status', 
       unnest(ARRAY['pending', 'in_progress', 'completed', 'failed', 
                    'cancelled', 'timeout', 'delivered', 'ack_timeout'])
UNION ALL  
SELECT 'failure_class',
       unnest(ARRAY['TRANSIENT', 'PERMANENT', 'EXPECTED_DROP', 'BUG', 'UNKNOWN']);

COMMENT ON VIEW v_system_contracts IS 'Fonte canonica de enums para validacao CI/CD - ADR-021 Fase 6.1';

-- 3. Tabela de Runbooks Obrigatorios (Fase 6.4)
CREATE TABLE IF NOT EXISTS runbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_type TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  owner TEXT,
  severity TEXT DEFAULT 'high',
  sla_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para runbooks
ALTER TABLE runbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage runbooks" ON runbooks;
CREATE POLICY "Admins can manage runbooks" ON runbooks
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can view runbooks" ON runbooks;
CREATE POLICY "Authenticated users can view runbooks" ON runbooks
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Inserir runbooks minimos obrigatorios
INSERT INTO runbooks (anomaly_type, title, steps, severity, sla_minutes) VALUES
('failed_no_execution', 'Job Falho Sem Execucao', 
 '["1. Verificar logs do agent", "2. Checar conectividade do endpoint", "3. Validar payload do job", "4. Recriar job manualmente", "5. Escalar para engenharia se persistir"]'::jsonb,
 'critical', 30),
('DLQ_BUG', 'Bug na Dead Letter Queue',
 '["1. Analisar registros com failure_class=BUG", "2. Identificar padrao de falha no codigo", "3. Abrir issue de correcao", "4. Replay manual apos fix", "5. Validar que nao ha reincidencia"]'::jsonb,
 'critical', 60),
('CASCADE_FAILURE', 'Falha em Cascata',
 '["1. Identificar componente de origem", "2. Isolar componente afetado", "3. Ativar modo degradado se necessario", "4. Rollback se houver deploy recente", "5. RCA obrigatorio em 24h"]'::jsonb,
 'critical', 15),
('zombie_delivered', 'Job Zumbi Delivered',
 '["1. Verificar agent_state do agent afetado", "2. Checar last_heartbeat", "3. Cancelar jobs orfaos pendentes", "4. Notificar operador responsavel", "5. Investigar causa da desconexao"]'::jsonb,
 'high', 60),
('stuck_installation', 'Instalacao Travada',
 '["1. Verificar se comando foi copiado", "2. Checar logs de enrollment", "3. Validar enrollment_key ativa", "4. Contactar usuario final", "5. Reemitir chave se necessario"]'::jsonb,
 'high', 120)
ON CONFLICT (anomaly_type) DO NOTHING;

-- 4. Semantic Fingerprint para Deduplicacao (Fase 6.3)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS semantic_fingerprint TEXT;

-- Funcao para calcular fingerprint
CREATE OR REPLACE FUNCTION calculate_task_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
  NEW.semantic_fingerprint := md5(
    COALESCE(NEW.tenant_id::text, '') || 
    COALESCE(NEW.source_type::text, '') || 
    COALESCE(NEW.severity, '') || 
    COALESCE(NEW.title, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-calcular fingerprint
DROP TRIGGER IF EXISTS tr_task_fingerprint ON tasks;
CREATE TRIGGER tr_task_fingerprint
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION calculate_task_fingerprint();

-- 5. Modo Degradado do Sistema (Fase 6.5)
DO $$ BEGIN
  CREATE TYPE system_operational_mode AS ENUM (
    'normal',
    'degraded', 
    'read_only',
    'halt_jobs'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tabela de estado do sistema (singleton)
CREATE TABLE IF NOT EXISTS system_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mode system_operational_mode NOT NULL DEFAULT 'normal',
  reason TEXT,
  changed_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir estado inicial
INSERT INTO system_state (id, mode, reason)
VALUES (1, 'normal', 'Sistema inicializado - Fase 6')
ON CONFLICT (id) DO NOTHING;

-- RLS para system_state
ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can manage system state" ON system_state;
CREATE POLICY "Super admins can manage system state" ON system_state
FOR ALL USING (public.is_current_super_admin());

DROP POLICY IF EXISTS "Anyone can read system state" ON system_state;
CREATE POLICY "Anyone can read system state" ON system_state
FOR SELECT USING (true);

-- Drop e recriar funcao get_system_mode com novo tipo
DROP FUNCTION IF EXISTS get_system_mode();
CREATE OR REPLACE FUNCTION get_system_mode()
RETURNS system_operational_mode AS $$
BEGIN
  RETURN (SELECT mode FROM system_state WHERE id = 1);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6. View para gate de runbooks (Fase 6.4.3)
DROP VIEW IF EXISTS v_anomalies_without_runbook;
CREATE VIEW v_anomalies_without_runbook AS
SELECT DISTINCT anomaly_type
FROM v_job_health_anomalies
WHERE anomaly_type NOT IN (
  SELECT anomaly_type FROM runbooks
);

COMMENT ON VIEW v_anomalies_without_runbook IS 'Anomalias CRITICAL sem runbook - deve estar sempre vazia';