
-- ================================================================
-- ONE-SHOT: Re-anchor entire audit_logs hash chain
-- Runs as migration (service_role), then drops itself
-- ================================================================
DO $$
DECLARE
  v_log RECORD;
  v_previous_hash TEXT;
  v_current_tenant UUID;
  v_new_integrity TEXT;
  v_count INTEGER;
  v_total INTEGER := 0;
BEGIN
  -- Disable immutability triggers
  ALTER TABLE audit_logs DISABLE TRIGGER tr_prevent_audit_modification;
  ALTER TABLE audit_logs DISABLE TRIGGER trg_immutable_audit_logs;
  -- Also disable the hash trigger to avoid double-computation
  ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_log_integrity;

  FOR v_current_tenant IN 
    SELECT DISTINCT al.tenant_id FROM audit_logs al ORDER BY al.tenant_id
  LOOP
    v_previous_hash := 'GENESIS';
    v_count := 0;
    
    FOR v_log IN 
      SELECT al.id, al.created_at, al.action, al.resource_type, al.resource_id, al.state_before, al.state_after
      FROM audit_logs al
      WHERE al.tenant_id = v_current_tenant
      ORDER BY al.created_at ASC, al.id ASC
    LOOP
      v_new_integrity := encode(sha256(convert_to(
        v_previous_hash || 
        v_log.id::text || 
        COALESCE(v_log.action, '') || 
        COALESCE(v_log.resource_type, '') ||
        COALESCE(v_log.resource_id, '') ||
        COALESCE(v_log.state_before::text, '{}') ||
        COALESCE(v_log.state_after::text, '{}') ||
        COALESCE(v_log.created_at::text, ''),
        'UTF8'
      )), 'hex');

      UPDATE audit_logs
      SET integrity_hash = v_new_integrity, previous_log_hash = v_previous_hash
      WHERE id = v_log.id;
      
      v_previous_hash := v_new_integrity;
      v_count := v_count + 1;
    END LOOP;
    
    v_total := v_total + v_count;
    RAISE NOTICE 'Tenant % re-anchored: % records', v_current_tenant, v_count;
  END LOOP;

  -- Re-enable all triggers
  ALTER TABLE audit_logs ENABLE TRIGGER tr_prevent_audit_modification;
  ALTER TABLE audit_logs ENABLE TRIGGER trg_immutable_audit_logs;
  ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_log_integrity;

  RAISE NOTICE 'Hash chain re-anchor complete: % total records fixed', v_total;
END;
$$;
