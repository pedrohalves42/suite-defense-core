-- =====================================================
-- P0 GAP FIX: Add payload_hash to jobs table
-- Ensures payload integrity can be verified before claim
-- =====================================================

-- 1. Add payload_hash column to jobs table
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS payload_hash TEXT;

-- 2. Create function to calculate canonical payload hash
CREATE OR REPLACE FUNCTION public.calculate_payload_hash(p_payload JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
$$;

-- 3. Create trigger function to auto-calculate payload_hash on INSERT
CREATE OR REPLACE FUNCTION public.auto_set_job_payload_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only set if not already provided and payload exists
  IF NEW.payload_hash IS NULL AND NEW.payload IS NOT NULL THEN
    NEW.payload_hash := calculate_payload_hash(NEW.payload);
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Create trigger on jobs table for INSERT
DROP TRIGGER IF EXISTS trg_auto_set_job_payload_hash ON public.jobs;
CREATE TRIGGER trg_auto_set_job_payload_hash
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_job_payload_hash();

-- 5. Create trigger to prevent payload modification after creation
CREATE OR REPLACE FUNCTION public.prevent_job_payload_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Block any modification to payload or payload_hash after job creation
  IF OLD.payload IS DISTINCT FROM NEW.payload THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Job payload cannot be modified after creation. Job ID: %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  
  IF OLD.payload_hash IS NOT NULL AND OLD.payload_hash IS DISTINCT FROM NEW.payload_hash THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Job payload_hash cannot be modified after creation. Job ID: %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_job_payload_modification ON public.jobs;
CREATE TRIGGER trg_prevent_job_payload_modification
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_job_payload_modification();

-- 6. Backfill existing jobs that don't have payload_hash
UPDATE public.jobs
SET payload_hash = calculate_payload_hash(payload)
WHERE payload_hash IS NULL 
  AND payload IS NOT NULL;

-- 7. Create index for faster lookups by payload_hash
CREATE INDEX IF NOT EXISTS idx_jobs_payload_hash ON public.jobs(payload_hash);

-- 8. Add comment for documentation
COMMENT ON COLUMN public.jobs.payload_hash IS 'SHA256 hash of canonical payload JSON. Immutable after creation. Used for integrity verification.';
COMMENT ON FUNCTION public.calculate_payload_hash IS 'Calculates SHA256 hash of JSONB payload for integrity verification.';