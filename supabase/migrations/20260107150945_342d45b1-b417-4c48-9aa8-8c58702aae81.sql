-- ============================================
-- RLS HARDENING - Migration 1: Critical Policies
-- Fixes 6 dangerous public UPDATE/DELETE/ALL policies
-- ============================================

-- agent_disk_metrics - DELETE
DROP POLICY IF EXISTS "Service role can delete disk metrics" ON agent_disk_metrics;
CREATE POLICY "Only service role can delete disk metrics"
  ON agent_disk_metrics FOR DELETE TO service_role USING (true);

-- agent_signing_keys - UPDATE  
DROP POLICY IF EXISTS "Service role can revoke signing keys" ON agent_signing_keys;
CREATE POLICY "Only service role can revoke signing keys"
  ON agent_signing_keys FOR UPDATE TO service_role USING (true);

-- job_executions - UPDATE
DROP POLICY IF EXISTS "Service role can finalize executions" ON job_executions;
CREATE POLICY "Only service role can finalize executions"
  ON job_executions FOR UPDATE TO service_role USING (true);

-- playbook_executions - UPDATE
DROP POLICY IF EXISTS "Service role can update executions" ON playbook_executions;
CREATE POLICY "Only service role can update executions"
  ON playbook_executions FOR UPDATE TO service_role USING (true);

-- risk_delta_snapshots - UPDATE
DROP POLICY IF EXISTS "Service role can update risk snapshots" ON risk_delta_snapshots;
CREATE POLICY "Only service role can update risk snapshots"
  ON risk_delta_snapshots FOR UPDATE TO service_role USING (true);

-- security_reports - ALL (CRITICAL)
DROP POLICY IF EXISTS "Service role can manage security reports" ON security_reports;
CREATE POLICY "Only service role can manage security reports"
  ON security_reports FOR ALL TO service_role USING (true) WITH CHECK (true);