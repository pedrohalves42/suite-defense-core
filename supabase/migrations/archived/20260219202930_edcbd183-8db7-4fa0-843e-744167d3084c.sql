
-- Auto-cancel pending/queued jobs when agent goes offline or inactive
CREATE OR REPLACE FUNCTION public.auto_cancel_jobs_on_agent_offline()
RETURNS TRIGGER AS $$
DECLARE
  cancelled_count INTEGER;
BEGIN
  -- Only trigger when agent transitions TO offline/inactive
  IF (NEW.agent_state = 'offline' AND OLD.agent_state IS DISTINCT FROM 'offline')
     OR (NEW.status = 'inactive' AND OLD.status != 'inactive') THEN
    
    UPDATE jobs
    SET status = 'cancelled',
        error_message = '[AUTO-CANCEL] Agent went offline/inactive at ' || now()::text
    WHERE agent_id = NEW.id
      AND status IN ('pending', 'queued')
    RETURNING 1 INTO cancelled_count;
    
    GET DIAGNOSTICS cancelled_count = ROW_COUNT;
    
    IF cancelled_count > 0 THEN
      RAISE LOG 'auto_cancel_jobs: Cancelled % jobs for agent % (%)',
        cancelled_count, NEW.agent_name, NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drop if exists to avoid duplicate trigger
DROP TRIGGER IF EXISTS trg_auto_cancel_jobs_on_offline ON agents;

CREATE TRIGGER trg_auto_cancel_jobs_on_offline
  AFTER UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_cancel_jobs_on_agent_offline();
