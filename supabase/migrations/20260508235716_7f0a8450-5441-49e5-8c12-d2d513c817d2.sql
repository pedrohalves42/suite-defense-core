-- Hardening SECURITY DEFINER functions with search_path and restricting execution
ALTER FUNCTION public.update_agent_heartbeat_atomic(UUID, JSONB) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.update_agent_heartbeat_atomic(UUID, JSONB) FROM PUBLIC;
-- Note: agents themselves use service role or specific tokens via Edge Functions, 
-- but we restrict PUBLIC to be safe.

ALTER FUNCTION public.cleanup_agent_hmac_signatures() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.cleanup_agent_hmac_signatures() FROM PUBLIC;

-- Create a scheduled job (if pg_cron is available) for signature rotation
-- Since we can't guarantee pg_cron, we'll ensure it's callable via Edge Function cleanup-router
-- which already exists in supabase/functions.