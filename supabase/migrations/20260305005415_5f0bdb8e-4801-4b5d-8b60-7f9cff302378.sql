
-- Add 'expired' as valid terminal status in job state machine
CREATE OR REPLACE FUNCTION enforce_job_state_transitions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_valid_transitions jsonb := '{
    "pending": ["queued", "delivered", "cancelled", "failed", "expired"],
    "queued": ["delivered", "failed", "cancelled", "expired"],
    "delivered": ["completed", "failed", "cancelled", "expired"],
    "running": ["completed", "failed", "cancelled", "timeout", "expired"],
    "completed": ["archived"],
    "failed": ["archived"],
    "cancelled": ["archived"],
    "timeout": ["archived"],
    "expired": ["archived"]
  }'::jsonb;
  v_allowed_states jsonb;
BEGIN
  -- Allow same-state updates
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  v_allowed_states := v_valid_transitions->OLD.status;
  
  IF v_allowed_states IS NULL OR NOT v_allowed_states ? NEW.status THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Cannot transition from % to %. Allowed: %',
      OLD.status, NEW.status, COALESCE(v_allowed_states, '[]'::jsonb)
    USING ERRCODE = '23514';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Ensure the ensure_completed_at trigger also handles 'expired'
CREATE OR REPLACE FUNCTION ensure_completed_at_on_terminal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed', 'cancelled', 'timeout', 'expired') AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
