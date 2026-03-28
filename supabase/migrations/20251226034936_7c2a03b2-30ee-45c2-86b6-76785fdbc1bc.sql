-- ============================================
-- PHASE 3: Security Hardening + Shadow Mode
-- ============================================

-- 1. TRIGGER ANTI-BYPASS: Forcar require_approval para acoes destrutivas
CREATE OR REPLACE FUNCTION enforce_no_auto_destructive_actions()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM playbook_actions
    WHERE playbook_id = NEW.id
    AND action_type IN ('isolate','kill_process','stop_service','disable_service','revoke_token','quarantine','network_isolate')
  ) THEN
    NEW.require_approval := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_safe_playbooks ON playbooks;
CREATE TRIGGER trg_enforce_safe_playbooks
BEFORE INSERT OR UPDATE ON playbooks
FOR EACH ROW
EXECUTE FUNCTION enforce_no_auto_destructive_actions();

-- 2. TABELA risk_decision_log: Log dedicado para decisoes do motor de risco
CREATE TABLE IF NOT EXISTS risk_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_execution_id uuid REFERENCES playbook_executions(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  playbook_id uuid REFERENCES playbooks(id) ON DELETE SET NULL,
  playbook_name text,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  risk_score numeric(4,3) NOT NULL,
  threshold numeric(4,3) NOT NULL,
  decision text NOT NULL CHECK (decision IN ('auto_execute', 'require_approval', 'skipped', 'dry_run')),
  decision_reason text,
  context jsonb DEFAULT '{}',
  dry_run boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index para queries por tenant e tempo
CREATE INDEX IF NOT EXISTS idx_risk_decision_log_tenant_time ON risk_decision_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_decision_log_execution ON risk_decision_log(playbook_execution_id);

-- RLS para risk_decision_log
ALTER TABLE risk_decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view risk decisions for their tenant"
ON risk_decision_log FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
));

CREATE POLICY "Service role can insert risk decisions"
ON risk_decision_log FOR INSERT
WITH CHECK (true);

-- 3. SHADOW MODE: Adicionar coluna dry_run em playbook_executions
ALTER TABLE playbook_executions 
ADD COLUMN IF NOT EXISTS dry_run boolean DEFAULT false;

-- 4. SHADOW MODE: Adicionar enable_dry_run_mode em tenant_settings
ALTER TABLE tenant_settings 
ADD COLUMN IF NOT EXISTS enable_dry_run_mode boolean DEFAULT false;

-- Comment para documentacao
COMMENT ON COLUMN tenant_settings.enable_dry_run_mode IS 'Shadow Mode: quando ativado, playbooks sao avaliados mas nao executados automaticamente. Todas as decisoes sao logadas em risk_decision_log com dry_run=true';
COMMENT ON COLUMN playbook_executions.dry_run IS 'Indica se esta execucao foi uma simulacao (Shadow Mode)';
COMMENT ON TABLE risk_decision_log IS 'Log dedicado para auditoria de decisoes do motor de risco de playbooks';
COMMENT ON FUNCTION enforce_no_auto_destructive_actions() IS 'Trigger anti-bypass: forca require_approval=true para playbooks com acoes destrutivas';