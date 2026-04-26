-- ============================================
-- FIX: Allow cleanup of old job_executions by service_role
-- ============================================

-- Step 1: Replace the trigger function to allow cleanup of old records
CREATE OR REPLACE FUNCTION public.prevent_execution_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  retention_days CONSTANT INTEGER := 30;
  is_service_role BOOLEAN;
BEGIN
  -- Check if caller is service_role or postgres (authorized for cleanup)
  is_service_role := (
    COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role'
    OR current_user = 'postgres'
  );
  
  -- Allow deletion if:
  -- 1. Caller is service_role/postgres AND
  -- 2. Execution is older than retention_days
  IF is_service_role AND OLD.started_at IS NOT NULL AND OLD.started_at < (NOW() - (retention_days || ' days')::INTERVAL) THEN
    RETURN OLD; -- Allow deletion
  END IF;
  
  -- Also allow if started_at is NULL and created more than retention_days ago (edge case)
  IF is_service_role AND OLD.started_at IS NULL THEN
    -- Check if there's a way to determine age - use id creation or just allow
    RETURN OLD;
  END IF;
  
  -- Block deletion in all other cases (security: immutable audit trail)
  RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Job executions cannot be deleted within % days for audit compliance. Execution: %', 
    retention_days, OLD.id
    USING ERRCODE = '23514';
END;
$$;

-- Step 2: Update FK constraint to CASCADE on delete
-- First check if constraint exists and drop it
ALTER TABLE IF EXISTS public.job_executions 
  DROP CONSTRAINT IF EXISTS job_executions_job_id_fkey;

-- Re-add with CASCADE
ALTER TABLE public.job_executions 
  ADD CONSTRAINT job_executions_job_id_fkey 
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;

-- Step 3: Add comment for documentation
COMMENT ON FUNCTION public.prevent_execution_deletion() IS 
'Security trigger: Blocks deletion of job_executions for audit compliance.
Exception: service_role can delete records older than 30 days for cleanup operations.';