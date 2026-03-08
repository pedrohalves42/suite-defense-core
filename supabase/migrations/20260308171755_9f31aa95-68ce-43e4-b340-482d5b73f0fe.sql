-- P1-SEC Fix 2: Add search_path to enforce_job_state_transitions
CREATE OR REPLACE FUNCTION public.enforce_job_state_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
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
$function$;

-- P1-SEC Fix 3: Add search_path to ensure_completed_at_on_terminal
CREATE OR REPLACE FUNCTION public.ensure_completed_at_on_terminal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  IF NEW.status IN ('completed', 'failed', 'cancelled', 'timeout', 'expired') AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- P1-SEC Fix 4: Restrict agent_archive_events service_role policy to actual service_role
DROP POLICY IF EXISTS "Service role full access to archive events" ON public.agent_archive_events;
CREATE POLICY "Service role full access to archive events" ON public.agent_archive_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);