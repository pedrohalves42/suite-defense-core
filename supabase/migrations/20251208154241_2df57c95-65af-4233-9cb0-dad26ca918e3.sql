-- Drop existing function with different signature
DROP FUNCTION IF EXISTS public.cleanup_old_hmac_signatures();

-- Recreate with correct return type
CREATE OR REPLACE FUNCTION public.cleanup_old_hmac_signatures()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete signatures older than 6 hours (well beyond the 5-minute replay window)
  DELETE FROM public.hmac_signatures
  WHERE used_at < NOW() - INTERVAL '6 hours';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Create index for efficient cleanup queries if not exists
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_used_at 
ON public.hmac_signatures(used_at);

-- Schedule cleanup via pg_cron every 6 hours
SELECT cron.schedule(
  'cleanup-hmac-signatures',
  '0 */6 * * *',
  $$SELECT public.cleanup_old_hmac_signatures()$$
);