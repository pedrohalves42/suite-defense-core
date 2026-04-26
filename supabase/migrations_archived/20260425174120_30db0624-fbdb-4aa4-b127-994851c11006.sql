-- Table for tracking HMAC signatures to prevent replay attacks
CREATE UNLOGGED TABLE IF NOT EXISTS public.agent_hmac_signatures (
    signature TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Index for cleanup optimization
CREATE INDEX IF NOT EXISTS idx_agent_hmac_signatures_created_at ON public.agent_hmac_signatures (created_at);

-- Enable RLS for completeness, though only service role should touch this
ALTER TABLE public.agent_hmac_signatures ENABLE ROW LEVEL SECURITY;

-- Atomic check and record function to eliminate TOCTOU race conditions
CREATE OR REPLACE FUNCTION public.hmac_check_and_record(
    p_signature TEXT,
    p_agent_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Try to insert the signature. If it exists, return false (replay detected).
    -- We use a 5-minute window via timestamp check in the verification logic,
    -- but the DB maintains a 6-hour TTL to be safe.
    INSERT INTO public.agent_hmac_signatures (signature, agent_name)
    VALUES (p_signature, p_agent_name)
    ON CONFLICT (signature) DO NOTHING;
    
    RETURN FOUND;
END;
$$;

-- Function to clean old signatures (TTL 6 hours)
CREATE OR REPLACE FUNCTION public.cleanup_expired_hmac_signatures()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
    DELETE FROM public.agent_hmac_signatures
    WHERE created_at < now() - interval '6 hours';
$$;

-- Grant execution to authenticated/anon if needed via service role
GRANT EXECUTE ON FUNCTION public.hmac_check_and_record(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_hmac_signatures() TO authenticated, service_role;
