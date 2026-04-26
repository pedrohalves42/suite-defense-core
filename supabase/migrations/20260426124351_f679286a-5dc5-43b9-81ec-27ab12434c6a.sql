-- Add unique constraint to prevent race conditions in replay protection
ALTER TABLE public.agent_hmac_signatures ADD CONSTRAINT agent_hmac_signatures_signature_unique UNIQUE (signature);

-- Rewrite function to be truly atomic using INSERT ... ON CONFLICT
CREATE OR REPLACE FUNCTION public.hmac_check_and_record(
    p_signature text,
    p_agent_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inserted boolean;
BEGIN
    -- Try to insert the signature. If it exists, it's a replay.
    INSERT INTO public.agent_hmac_signatures (signature, agent_name, created_at)
    VALUES (p_signature, p_agent_name, now())
    ON CONFLICT (signature) DO NOTHING;
    
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    
    -- If ROW_COUNT is 1, it was a new signature and we recorded it.
    -- If ROW_COUNT is 0, it was already present (replay).
    RETURN v_inserted > 0;
END;
$$;