
-- =====================================================
-- ENTERPRISE HARDENING: Motor de Automacao CyberShield
-- Anti-tempestade, Circuit Breaker, Blast Radius, 
-- Governanca, Versionamento, SLA, Auditoria de Decisoes
-- =====================================================

-- 1. AUTOMATION EXECUTION LOG (Debounce por agente+regra)
CREATE TABLE IF NOT EXISTS public.automation_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL,
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  success boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_exec_log_lookup ON public.automation_execution_log (agent_id, rule_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_log_tenant ON public.automation_execution_log (tenant_id, executed_at DESC);

ALTER TABLE public.automation_execution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on automation_execution_log" ON public.automation_execution_log FOR ALL USING (true) WITH CHECK (true);
REVOKE ALL ON public.automation_execution_log FROM anon;

COMMENT ON TABLE public.automation_execution_log IS 'Log de debounce para anti-tempestade de jobs: 1 execucao por agente/regra por periodo de cooldown';

-- 2. HARDENING COLUMNS on automation_rules
ALTER TABLE public.automation_rules 
  ADD COLUMN IF NOT EXISTS max_executions_per_hour integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS execution_cooldown_minutes integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS circuit_breaker_threshold integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS circuit_breaker_window_minutes integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS circuit_state text DEFAULT 'closed',
  ADD COLUMN IF NOT EXISTS circuit_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS circuit_recovery_minutes integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS max_affected_percentage numeric DEFAULT 30,
  ADD COLUMN IF NOT EXISTS risk_threshold integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_approval boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_dual_approval boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_execute_if_severity text DEFAULT 'critical',
  ADD COLUMN IF NOT EXISTS dry_run boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'active';

ALTER TABLE public.automation_rules DROP CONSTRAINT IF EXISTS automation_rules_mode_check;
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_mode_check 
  CHECK (mode IN ('active', 'observe_only', 'disabled'));

ALTER TABLE public.automation_rules DROP CONSTRAINT IF EXISTS automation_rules_circuit_state_check;
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_circuit_state_check 
  CHECK (circuit_state IN ('closed', 'open', 'half_open'));

COMMENT ON COLUMN public.automation_rules.max_executions_per_hour IS 'Rate limit maximo de execucoes por hora por tenant/regra';
COMMENT ON COLUMN public.automation_rules.circuit_state IS 'Estado do circuit breaker: closed (normal), open (bloqueado), half_open (teste)';
COMMENT ON COLUMN public.automation_rules.mode IS 'Modo de operacao: active (executa), observe_only (so loga), disabled (inativo)';
COMMENT ON COLUMN public.automation_rules.max_affected_percentage IS 'Blast radius maximo: % da frota que pode ser afetada simultaneamente';
COMMENT ON COLUMN public.automation_rules.dry_run IS 'Modo dry-run: avalia e loga mas nao executa acoes';

-- 3. AUTOMATION APPROVALS (Governanca)
CREATE TABLE IF NOT EXISTS public.automation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  agent_id uuid,
  trigger_data jsonb,
  status text DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  second_approved_by uuid,
  second_approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.automation_approvals DROP CONSTRAINT IF EXISTS automation_approvals_status_check;
ALTER TABLE public.automation_approvals ADD CONSTRAINT automation_approvals_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executed'));

CREATE INDEX IF NOT EXISTS idx_approvals_pending ON public.automation_approvals (tenant_id, status) WHERE status = 'pending';

ALTER TABLE public.automation_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on automation_approvals" ON public.automation_approvals FOR ALL USING (true) WITH CHECK (true);
REVOKE ALL ON public.automation_approvals FROM anon;

COMMENT ON TABLE public.automation_approvals IS 'Fila de aprovacoes para acoes de automacao que requerem autorizacao humana';

-- 4. AUTOMATION RULE VERSIONS (Versionamento)
CREATE TABLE IF NOT EXISTS public.automation_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  version integer NOT NULL,
  config jsonb NOT NULL,
  changed_by uuid,
  change_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_versions_lookup ON public.automation_rule_versions (rule_id, version DESC);

ALTER TABLE public.automation_rule_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on automation_rule_versions" ON public.automation_rule_versions FOR ALL USING (true) WITH CHECK (true);
REVOKE ALL ON public.automation_rule_versions FROM anon;

COMMENT ON TABLE public.automation_rule_versions IS 'Historico de versoes de regras de automacao para rollback e auditoria';

-- 5. AUTOMATION DECISION LOG (Auditoria Enterprise)
CREATE TABLE IF NOT EXISTS public.automation_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  rule_id uuid NOT NULL,
  rule_name text,
  agent_id uuid,
  decision text NOT NULL,
  reason text,
  risk_score numeric,
  severity text,
  executed boolean DEFAULT false,
  blocked_reason text,
  impact_percent numeric,
  mode text,
  trigger_data jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.automation_decision_log DROP CONSTRAINT IF EXISTS automation_decision_log_decision_check;
ALTER TABLE public.automation_decision_log ADD CONSTRAINT automation_decision_log_decision_check 
  CHECK (decision IN ('executed', 'blocked_cooldown', 'blocked_rate_limit', 'blocked_circuit_breaker', 
                       'blocked_blast_radius', 'blocked_approval_required', 'blocked_risk_threshold',
                       'observe_only', 'dry_run', 'blocked_disabled', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_decision_log_tenant ON public.automation_decision_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_log_rule ON public.automation_decision_log (rule_id, created_at DESC);

ALTER TABLE public.automation_decision_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on automation_decision_log" ON public.automation_decision_log FOR ALL USING (true) WITH CHECK (true);
REVOKE ALL ON public.automation_decision_log FROM anon;

COMMENT ON TABLE public.automation_decision_log IS 'Log consolidado de decisoes do motor de automacao para auditoria enterprise';

-- 6. AUTOMATION SLA METRICS
CREATE TABLE IF NOT EXISTS public.automation_sla_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  avg_execution_time_ms numeric DEFAULT 0,
  success_rate numeric DEFAULT 100,
  last_24h_executions integer DEFAULT 0,
  last_24h_failures integer DEFAULT 0,
  last_24h_blocked integer DEFAULT 0,
  p95_execution_time_ms numeric DEFAULT 0,
  calculated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, rule_id)
);

ALTER TABLE public.automation_sla_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on automation_sla_metrics" ON public.automation_sla_metrics FOR ALL USING (true) WITH CHECK (true);
REVOKE ALL ON public.automation_sla_metrics FROM anon;

COMMENT ON TABLE public.automation_sla_metrics IS 'Metricas de SLA interno do motor de automacao';

-- 7. TRIGGER: Auto-version on rule update
CREATE OR REPLACE FUNCTION public.trg_automation_rule_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version integer;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM automation_rule_versions
  WHERE rule_id = NEW.id;

  INSERT INTO automation_rule_versions (rule_id, tenant_id, version, config, changed_by)
  VALUES (
    NEW.id, NEW.tenant_id, next_version,
    jsonb_build_object(
      'name', NEW.name, 'trigger_type', NEW.trigger_type,
      'trigger_conditions', NEW.trigger_conditions,
      'action_type', NEW.action_type, 'action_config', NEW.action_config,
      'target_scope', NEW.target_scope, 'cooldown_minutes', NEW.cooldown_minutes,
      'priority', NEW.priority, 'mode', NEW.mode,
      'max_executions_per_hour', NEW.max_executions_per_hour,
      'circuit_breaker_threshold', NEW.circuit_breaker_threshold,
      'max_affected_percentage', NEW.max_affected_percentage,
      'requires_approval', NEW.requires_approval, 'dry_run', NEW.dry_run
    ),
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_version_automation_rule ON public.automation_rules;
CREATE TRIGGER trg_version_automation_rule
  AFTER UPDATE ON public.automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_automation_rule_version();

-- 8. RPC: Circuit breaker state management
CREATE OR REPLACE FUNCTION public.check_and_update_circuit_breaker(
  p_rule_id uuid,
  p_threshold integer DEFAULT 10,
  p_window_minutes integer DEFAULT 5,
  p_recovery_minutes integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_fail_count integer;
BEGIN
  SELECT circuit_state, circuit_opened_at INTO v_rule
  FROM automation_rules WHERE id = p_rule_id;

  IF v_rule.circuit_state = 'open' THEN
    IF v_rule.circuit_opened_at IS NOT NULL 
       AND v_rule.circuit_opened_at + (p_recovery_minutes || ' minutes')::interval < now() THEN
      UPDATE automation_rules SET circuit_state = 'half_open' WHERE id = p_rule_id;
      RETURN jsonb_build_object('state', 'half_open', 'allowed', true);
    END IF;
    RETURN jsonb_build_object('state', 'open', 'allowed', false, 
      'recovery_at', v_rule.circuit_opened_at + (p_recovery_minutes || ' minutes')::interval);
  END IF;

  SELECT count(*) INTO v_fail_count
  FROM automation_executions
  WHERE rule_id = p_rule_id AND status = 'failed'
    AND executed_at > now() - (p_window_minutes || ' minutes')::interval;

  IF v_fail_count >= p_threshold THEN
    UPDATE automation_rules SET circuit_state = 'open', circuit_opened_at = now() WHERE id = p_rule_id;
    RETURN jsonb_build_object('state', 'open', 'allowed', false, 'failures', v_fail_count);
  END IF;

  IF v_rule.circuit_state = 'half_open' THEN
    UPDATE automation_rules SET circuit_state = 'closed', circuit_opened_at = NULL WHERE id = p_rule_id;
  END IF;

  RETURN jsonb_build_object('state', 'closed', 'allowed', true, 'failures', v_fail_count);
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_update_circuit_breaker FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_and_update_circuit_breaker TO service_role;

-- 9. Immutability trigger for decision log
CREATE OR REPLACE FUNCTION public.prevent_decision_log_modification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'automation_decision_log is append-only for compliance';
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_immutable_decision_log
  BEFORE UPDATE OR DELETE ON public.automation_decision_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_decision_log_modification();
