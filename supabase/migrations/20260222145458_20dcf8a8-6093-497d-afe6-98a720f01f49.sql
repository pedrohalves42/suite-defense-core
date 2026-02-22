
-- =============================================================================
-- FIX V-007: Replace 6 dangerous public USING(true) policies with service_role-only
-- FIX V-005: Add immutability triggers on 5 audit tables
-- =============================================================================

-- =============================================
-- PART 1: Fix dangerous public policies
-- =============================================

-- 1. soar_executions: DROP public INSERT, recreate for service_role
DROP POLICY IF EXISTS "soar_executions_service_insert" ON public.soar_executions;
CREATE POLICY "soar_executions_service_role_insert"
  ON public.soar_executions FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 2. automation_execution_log
DROP POLICY IF EXISTS "Service role full access on automation_execution_log" ON public.automation_execution_log;
CREATE POLICY "automation_execution_log_service_role_all"
  ON public.automation_execution_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 3. automation_approvals
DROP POLICY IF EXISTS "Service role full access on automation_approvals" ON public.automation_approvals;
CREATE POLICY "automation_approvals_service_role_all"
  ON public.automation_approvals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 4. automation_rule_versions
DROP POLICY IF EXISTS "Service role full access on automation_rule_versions" ON public.automation_rule_versions;
CREATE POLICY "automation_rule_versions_service_role_all"
  ON public.automation_rule_versions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 5. automation_decision_log
DROP POLICY IF EXISTS "Service role full access on automation_decision_log" ON public.automation_decision_log;
CREATE POLICY "automation_decision_log_service_role_all"
  ON public.automation_decision_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 6. automation_sla_metrics
DROP POLICY IF EXISTS "Service role full access on automation_sla_metrics" ON public.automation_sla_metrics;
CREATE POLICY "automation_sla_metrics_service_role_all"
  ON public.automation_sla_metrics FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- PART 2: Immutability triggers on audit tables
-- =============================================

-- Generic immutability function
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABILITY VIOLATION: % on audit table % is forbidden (INV-005)', TG_OP, TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

-- Revoke from public/anon
REVOKE ALL ON FUNCTION public.prevent_audit_mutation() FROM public, anon;

-- 1. audit_logs
DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

-- 2. security_logs
DROP TRIGGER IF EXISTS trg_immutable_security_logs ON public.security_logs;
CREATE TRIGGER trg_immutable_security_logs
  BEFORE UPDATE OR DELETE ON public.security_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

-- 3. agent_evidence_logs
DROP TRIGGER IF EXISTS trg_immutable_agent_evidence_logs ON public.agent_evidence_logs;
CREATE TRIGGER trg_immutable_agent_evidence_logs
  BEFORE UPDATE OR DELETE ON public.agent_evidence_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

-- 4. domain_events
DROP TRIGGER IF EXISTS trg_immutable_domain_events ON public.domain_events;
CREATE TRIGGER trg_immutable_domain_events
  BEFORE UPDATE OR DELETE ON public.domain_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

-- 5. poe_chain_breaks
DROP TRIGGER IF EXISTS trg_immutable_poe_chain_breaks ON public.poe_chain_breaks;
CREATE TRIGGER trg_immutable_poe_chain_breaks
  BEFORE UPDATE OR DELETE ON public.poe_chain_breaks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();
