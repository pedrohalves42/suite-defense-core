-- ============================================
-- RLS HARDENING - Migration 2: INSERT Policies (Part 2)
-- Fixes remaining 10 public INSERT policies
-- ============================================

-- forensic_snapshots
DROP POLICY IF EXISTS "Service role can insert forensic snapshots" ON forensic_snapshots;
CREATE POLICY "Only service role can insert forensic snapshots"
  ON forensic_snapshots FOR INSERT TO service_role WITH CHECK (true);

-- job_executions
DROP POLICY IF EXISTS "Service role can insert job executions" ON job_executions;
CREATE POLICY "Only service role can insert job executions"
  ON job_executions FOR INSERT TO service_role WITH CHECK (true);

-- playbook_executions
DROP POLICY IF EXISTS "Service role can insert playbook executions" ON playbook_executions;
CREATE POLICY "Only service role can insert playbook executions"
  ON playbook_executions FOR INSERT TO service_role WITH CHECK (true);

-- risk_decision_log
DROP POLICY IF EXISTS "Service role can insert risk decisions" ON risk_decision_log;
CREATE POLICY "Only service role can insert risk decisions"
  ON risk_decision_log FOR INSERT TO service_role WITH CHECK (true);

-- risk_delta_snapshots
DROP POLICY IF EXISTS "Service role can insert risk snapshots" ON risk_delta_snapshots;
CREATE POLICY "Only service role can insert risk snapshots"
  ON risk_delta_snapshots FOR INSERT TO service_role WITH CHECK (true);

-- rls_test_results
DROP POLICY IF EXISTS "Service role can insert test results" ON rls_test_results;
CREATE POLICY "Only service role can insert test results"
  ON rls_test_results FOR INSERT TO service_role WITH CHECK (true);

-- score_governance_log
DROP POLICY IF EXISTS "Service role can insert governance log" ON score_governance_log;
CREATE POLICY "Only service role can insert governance log"
  ON score_governance_log FOR INSERT TO service_role WITH CHECK (true);

-- slo_measurements
DROP POLICY IF EXISTS "Service role can insert SLO measurements" ON slo_measurements;
CREATE POLICY "Only service role can insert SLO measurements"
  ON slo_measurements FOR INSERT TO service_role WITH CHECK (true);

-- subscription_events
DROP POLICY IF EXISTS "Service role can insert subscription events" ON subscription_events;
CREATE POLICY "Only service role can insert subscription events"
  ON subscription_events FOR INSERT TO service_role WITH CHECK (true);

-- tenant_risk_scores
DROP POLICY IF EXISTS "Service role can insert risk scores" ON tenant_risk_scores;
CREATE POLICY "Only service role can insert risk scores"
  ON tenant_risk_scores FOR INSERT TO service_role WITH CHECK (true);