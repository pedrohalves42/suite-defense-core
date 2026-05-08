DROP FUNCTION IF EXISTS public.run_system_maintenance();

CREATE OR REPLACE FUNCTION public.run_system_maintenance()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Expunge old HMAC signatures (sliding window 24h)
  DELETE FROM agent_hmac_signatures 
  WHERE verified_at < now() - interval '24 hours';
  
  -- 2. Cleanup expired session records
  DELETE FROM active_sessions 
  WHERE last_activity_at < now() - interval '2 hours';
END;
$$;
