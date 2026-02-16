
-- Allow archived_at to be set on finalized executions (archival is metadata, not mutation)
CREATE OR REPLACE FUNCTION public.prevent_execution_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow setting archived_at on any execution (archival is administrative metadata)
  IF OLD.status IN ('completed', 'failed') THEN
    -- Only archived_at change is allowed on finalized executions
    IF (NEW.status = OLD.status
        AND NEW.result IS NOT DISTINCT FROM OLD.result
        AND NEW.error IS NOT DISTINCT FROM OLD.error
        AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at
        AND NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
      RETURN NEW;
    END IF;
    
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Finalized executions cannot be modified. Execution: %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  
  -- Don't allow modifying immutable fields
  IF NEW.job_id != OLD.job_id 
     OR NEW.agent_id != OLD.agent_id 
     OR NEW.tenant_id != OLD.tenant_id
     OR NEW.payload_hash != OLD.payload_hash
     OR NEW.nonce != OLD.nonce
     OR NEW.claimed_at != OLD.claimed_at THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Cannot modify immutable fields on execution: %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  
  RETURN NEW;
END;
$function$;
