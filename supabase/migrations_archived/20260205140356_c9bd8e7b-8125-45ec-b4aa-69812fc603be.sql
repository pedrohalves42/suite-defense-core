
-- FIX: Adicionar search_path a funcao enforce_job_state_transitions
-- Esta e uma funcao trigger, nao SECURITY DEFINER, mas precisa de search_path para o linter

CREATE OR REPLACE FUNCTION public.enforce_job_state_transitions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_valid_transitions jsonb := '{
    "pending": ["queued", "delivered", "cancelled", "failed"],
    "queued": ["delivered", "failed", "cancelled"],
    "delivered": ["completed", "failed", "cancelled"],
    "completed": ["archived"],
    "failed": ["archived"],
    "cancelled": ["archived"]
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
$function$;
