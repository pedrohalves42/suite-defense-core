
-- =============================================================================
-- V-103 DOCUMENTATION: Service Role Policies (ADR-023 Compliance)
-- These policies are INTENTIONAL for backend automation via Edge Functions
-- =============================================================================

-- Document tables with service_role policies
COMMENT ON TABLE agent_builds IS 
'Agent build artifacts. Service role policies allow Edge Functions to manage build lifecycle.
SECURITY: service_role only - not accessible to authenticated users.';

COMMENT ON TABLE agent_disk_metrics IS 
'Disk metrics collected by agents. Service role policies for telemetry ingestion.
SECURITY: service_role only - agents submit via authenticated Edge Functions.';

COMMENT ON TABLE agent_evidence_logs IS 
'Forensic evidence chain. Service role INSERT for immutable audit trail.
SECURITY: service_role only - append-only via Edge Functions.';

COMMENT ON TABLE agent_safe_mode_events IS 
'Agent safe mode tracking. Service role for system-triggered events.
SECURITY: service_role only - automated by backend.';

COMMENT ON TABLE agent_signing_keys IS 
'Cryptographic signing keys for agents. Service role for key lifecycle.
SECURITY: service_role only - managed via secure backend operations.';

COMMENT ON TABLE ai_inference_metrics IS 
'AI model performance metrics. Service role for telemetry collection.
SECURITY: service_role only - Edge Functions record inference stats.';

COMMENT ON TABLE cron_health_checks IS 
'Cron job health monitoring. Service role for automated health checks.
SECURITY: service_role only - pg_cron and monitoring functions.';

COMMENT ON TABLE edge_function_metrics IS 
'Edge function performance telemetry. Service role for self-monitoring.
SECURITY: service_role only - functions log their own metrics.';

-- Add security metadata view for auditors
CREATE OR REPLACE VIEW v_service_role_policies AS
SELECT 
  tablename,
  policyname,
  cmd as operation,
  'service_role' as granted_to,
  'INTENTIONAL: Backend automation via Edge Functions' as justification,
  'LOW' as risk_level
FROM pg_policies
WHERE schemaname = 'public'
  AND roles::text = '{service_role}'
  AND (qual::text = 'true' OR with_check::text = 'true')
ORDER BY tablename;

COMMENT ON VIEW v_service_role_policies IS 
'Audit view: Lists all service_role policies with USING(true)/WITH CHECK(true).
These are INTENTIONAL for backend automation and documented per ADR-023.
Risk: LOW - service_role key is only accessible to Edge Functions.';
