-- =============================================================================
-- ADR-INV-005: Audit Logs Immutability Enforcement (V-001 FIX)
-- =============================================================================

-- Function to block modifications on immutable audit tables
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_VIOLATION: % on % is blocked. Audit logs are immutable for SOC2/ISO27001 compliance.', 
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION prevent_audit_modification() IS 
'ADR-INV-005: Enforces immutability on audit tables. Returns ERRCODE 23514.';

-- Apply to audit_logs
DROP TRIGGER IF EXISTS tr_prevent_audit_modification ON audit_logs;
CREATE TRIGGER tr_prevent_audit_modification
  BEFORE DELETE OR UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- Apply to security_logs
DROP TRIGGER IF EXISTS tr_prevent_security_logs_modification ON security_logs;
CREATE TRIGGER tr_prevent_security_logs_modification
  BEFORE DELETE OR UPDATE ON security_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- Apply to agent_evidence_logs
DROP TRIGGER IF EXISTS tr_prevent_evidence_logs_modification ON agent_evidence_logs;
CREATE TRIGGER tr_prevent_evidence_logs_modification
  BEFORE DELETE OR UPDATE ON agent_evidence_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();