-- ============================================
-- RLS HARDENING - Migration 2: INSERT Policies (Part 1)
-- Fixes 10 public INSERT policies
-- ============================================

-- agent_disk_metrics
DROP POLICY IF EXISTS "Service role can insert disk metrics" ON agent_disk_metrics;
CREATE POLICY "Only service role can insert disk metrics"
  ON agent_disk_metrics FOR INSERT TO service_role WITH CHECK (true);

-- agent_evidence_logs
DROP POLICY IF EXISTS "Service role can insert evidence" ON agent_evidence_logs;
CREATE POLICY "Only service role can insert evidence"
  ON agent_evidence_logs FOR INSERT TO service_role WITH CHECK (true);

-- agent_safe_mode_events
DROP POLICY IF EXISTS "Service role can insert safe mode events" ON agent_safe_mode_events;
CREATE POLICY "Only service role can insert safe mode events"
  ON agent_safe_mode_events FOR INSERT TO service_role WITH CHECK (true);

-- agent_signing_keys
DROP POLICY IF EXISTS "Service role can insert signing keys" ON agent_signing_keys;
CREATE POLICY "Only service role can insert signing keys"
  ON agent_signing_keys FOR INSERT TO service_role WITH CHECK (true);

-- ai_rejected_decisions
DROP POLICY IF EXISTS "Service role can insert rejected decisions" ON ai_rejected_decisions;
CREATE POLICY "Only service role can insert rejected decisions"
  ON ai_rejected_decisions FOR INSERT TO service_role WITH CHECK (true);

-- audit_integrity_checks
DROP POLICY IF EXISTS "Service role can insert integrity checks" ON audit_integrity_checks;
CREATE POLICY "Only service role can insert integrity checks"
  ON audit_integrity_checks FOR INSERT TO service_role WITH CHECK (true);

-- audit_report_verifications
DROP POLICY IF EXISTS "Service role can insert verifications" ON audit_report_verifications;
CREATE POLICY "Only service role can insert verifications"
  ON audit_report_verifications FOR INSERT TO service_role WITH CHECK (true);

-- blocked_access_attempts
DROP POLICY IF EXISTS "Service role can insert blocked attempts" ON blocked_access_attempts;
CREATE POLICY "Only service role can insert blocked attempts"
  ON blocked_access_attempts FOR INSERT TO service_role WITH CHECK (true);

-- decision_events
DROP POLICY IF EXISTS "Service role can insert decision events" ON decision_events;
CREATE POLICY "Only service role can insert decision events"
  ON decision_events FOR INSERT TO service_role WITH CHECK (true);

-- edge_function_metrics
DROP POLICY IF EXISTS "Service role can insert function metrics" ON edge_function_metrics;
CREATE POLICY "Only service role can insert function metrics"
  ON edge_function_metrics FOR INSERT TO service_role WITH CHECK (true);