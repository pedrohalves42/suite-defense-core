CREATE OR REPLACE FUNCTION public.hmac_check_and_record(p_signature text, p_agent_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_row_count INTEGER;
BEGIN
    -- V-14005: Atomic check and record for replay protection
    -- HOTFIX-AUTH-02: previously declared v_inserted BOOLEAN and compared
    -- "boolean > 0", which raised Postgres 42883 (operator does not exist:
    -- boolean > integer) and broke the entire HMAC replay-check path.
    INSERT INTO public.agent_hmac_signatures (signature, agent_name, created_at)
    VALUES (p_signature, p_agent_name, now())
    ON CONFLICT (signature) DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    -- true  = new signature inserted (accept)
    -- false = signature already existed (replay)
    RETURN v_row_count > 0;
END;
$function$;