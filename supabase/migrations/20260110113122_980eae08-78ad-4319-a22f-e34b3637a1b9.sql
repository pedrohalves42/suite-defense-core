
-- Fix: Use correct column names
CREATE OR REPLACE FUNCTION public.verify_audit_log_integrity()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_with_hash integer;
  v_broken integer;
BEGIN
  SELECT COUNT(*) INTO v_total FROM audit_logs;
  SELECT COUNT(*) INTO v_with_hash FROM audit_logs WHERE integrity_hash IS NOT NULL;
  
  SELECT COUNT(*) INTO v_broken
  FROM audit_logs a1
  WHERE a1.previous_log_hash IS NOT NULL 
    AND NOT EXISTS (SELECT 1 FROM audit_logs a2 WHERE a2.integrity_hash = a1.previous_log_hash);

  RETURN jsonb_build_object(
    'total_entries', v_total,
    'entries_with_hash', v_with_hash,
    'broken_chains', v_broken,
    'status', CASE WHEN v_broken = 0 THEN 'healthy' ELSE 'broken' END,
    'checked_at', now()
  );
END;
$$;

-- Fix health check queries to use correct column names
UPDATE system_health_checks 
SET check_query = 'SELECT NOT EXISTS (
  SELECT 1 FROM audit_logs a1
  WHERE a1.previous_log_hash IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM audit_logs a2 WHERE a2.integrity_hash = a1.previous_log_hash)
) OR NOT EXISTS (SELECT 1 FROM audit_logs WHERE previous_log_hash IS NOT NULL)'
WHERE check_name = 'audit_log_intact';
