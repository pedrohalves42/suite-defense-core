
-- =============================================================================
-- FIX: job_executions trigger references non-existent "completed_at" column
-- The actual column is "finished_at" but trigger trg_auto_create_evidence 
-- references NEW.completed_at, causing continuous errors in logs.
-- =============================================================================

-- Fix the trigger function to use the correct column name
CREATE OR REPLACE FUNCTION public.auto_create_evidence_from_execution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_name text;
  v_tenant_id uuid;
  v_event_type text;
BEGIN
  -- Determine event type
  IF NEW.status = 'completed' THEN
    v_event_type := 'job_execution';
  ELSIF NEW.status = 'failed' THEN
    v_event_type := 'error';
  ELSE
    RETURN NEW;
  END IF;

  -- Get agent info
  SELECT a.hostname, a.tenant_id INTO v_agent_name, v_tenant_id
  FROM agents a WHERE a.id = NEW.agent_id;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO agent_evidence_logs (
    agent_id, agent_name, tenant_id, event_type, event_data, evidence_hash, severity
  ) VALUES (
    NEW.agent_id,
    COALESCE(v_agent_name, 'unknown'),
    v_tenant_id,
    v_event_type,
    jsonb_build_object(
      'execution_id', NEW.id,
      'job_id', NEW.job_id,
      'status', NEW.status,
      'exit_code', NEW.exit_code,
      'started_at', NEW.started_at,
      'finished_at', NEW.finished_at
    ),
    encode(digest(NEW.id::text || NEW.status || COALESCE(NEW.started_at::text, ''), 'sha256'), 'hex'),
    CASE WHEN NEW.status = 'failed' THEN 'high' ELSE 'low' END
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Evidence creation failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
