-- =============================================================================
-- ADR-028: Eliminacao de Politicas Permissivas Residuais
-- =============================================================================

-- 1. ai_rejected_decisions - remover policy duplicada public + true
DROP POLICY IF EXISTS "System can insert rejected decisions" ON ai_rejected_decisions;

-- 2. audit_integrity_checks - remover policy duplicada public + true
DROP POLICY IF EXISTS "System can insert integrity checks" ON audit_integrity_checks;

-- 3. audit_report_verifications - remover policy duplicada public + true
DROP POLICY IF EXISTS "Allow public verification inserts" ON audit_report_verifications;

-- 4. edge_function_metrics - remover policy duplicada public + true
DROP POLICY IF EXISTS "service_role_insert_efm" ON edge_function_metrics;

-- 5. playbook_executions - remover policy duplicada public + true
DROP POLICY IF EXISTS "Service role can insert executions" ON playbook_executions;

-- 6. rls_test_results - remover policy duplicada public + true
DROP POLICY IF EXISTS "System can insert RLS test results" ON rls_test_results;

-- 7. subscription_events - remover policy duplicada public + true
DROP POLICY IF EXISTS "system_insert_events" ON subscription_events;

-- 8. task_events - remover policy duplicada e criar correta
DROP POLICY IF EXISTS "Service role can insert task events" ON task_events;
CREATE POLICY "Only service role can insert task events"
ON task_events FOR INSERT
TO service_role
WITH CHECK (true);

-- 9. tenant_risk_scores - remover policy duplicada public + true
DROP POLICY IF EXISTS "service_insert_scores" ON tenant_risk_scores;