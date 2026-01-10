
-- Fix: Correct table name to audit_logs
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
  SELECT COUNT(*) INTO v_with_hash FROM audit_logs WHERE hash IS NOT NULL;
  
  SELECT COUNT(*) INTO v_broken
  FROM audit_logs a1
  WHERE a1.previous_hash IS NOT NULL 
    AND NOT EXISTS (SELECT 1 FROM audit_logs a2 WHERE a2.hash = a1.previous_hash);

  RETURN jsonb_build_object(
    'total_entries', v_total,
    'entries_with_hash', v_with_hash,
    'broken_chains', v_broken,
    'status', CASE WHEN v_broken = 0 THEN 'healthy' ELSE 'broken' END,
    'checked_at', now()
  );
END;
$$;

-- Also fix auto_collect_task_evidence to use correct table
CREATE OR REPLACE FUNCTION public.auto_collect_task_evidence()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status = 'open' THEN
    INSERT INTO audit_logs (tenant_id, action, actor_id, actor_type, details)
    VALUES (
      NEW.tenant_id,
      'evidence_collection_triggered',
      NULL,
      'system',
      jsonb_build_object(
        'task_id', NEW.id,
        'task_title', NEW.title,
        'source_type', NEW.source_type,
        'fingerprint_id', NEW.fingerprint_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
