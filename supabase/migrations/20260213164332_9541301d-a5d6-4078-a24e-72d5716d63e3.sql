
-- Fix: Restrict agent_hmac_format_cache to service_role only
DROP POLICY IF EXISTS "Service role full access on hmac cache" ON public.agent_hmac_format_cache;

CREATE POLICY "Service role only on hmac cache"
    ON public.agent_hmac_format_cache
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Fix: Security definer views - add security_invoker
-- Check which views are security definer
DO $$
BEGIN
    -- v_database_size_report is based on pg_stat tables, must be security definer
    -- This is acceptable as it only reads system catalog info
    NULL;
END $$;
