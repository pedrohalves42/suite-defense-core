-- Fix: action-center-feed 500 "actor_type" missing on audit_logs
-- Root cause: trigger function public.auto_collect_task_evidence() inserts into audit_logs.actor_type (column does not exist)

CREATE OR REPLACE FUNCTION public.auto_collect_task_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status = 'open' THEN
    INSERT INTO audit_logs (
      tenant_id,
      action,
      actor_id,
      resource_type,
      resource_id,
      details,
      success
    ) VALUES (
      NEW.tenant_id,
      'evidence_collection_triggered',
      NULL,
      'task',
      NEW.id::text,
      jsonb_build_object(
        'task_id', NEW.id,
        'task_title', NEW.title,
        'source_type', NEW.source_type,
        'fingerprint_id', NEW.fingerprint_id,
        'actor_type', 'system'
      ),
      true
    );
  END IF;

  RETURN NEW;
END;
$$;