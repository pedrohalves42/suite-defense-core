
-- Atomic replay protection: check + insert in one call
-- Eliminates TOCTOU race between SELECT and INSERT
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
  v_exists boolean;
BEGIN
  -- Check if signature already exists (using the existing index)
  SELECT EXISTS(
    SELECT 1 FROM public.hmac_signatures WHERE signature = p_signature LIMIT 1
  ) INTO v_exists;

  IF v_exists THEN
    RETURN false; -- replay detected
  END IF;

  -- Insert with a safety net: if a concurrent call inserted between
  -- our SELECT and this INSERT, the unique index on (signature, used_at)
  -- could still allow it (different used_at). Use advisory lock on hash.
  PERFORM pg_advisory_xact_lock(hashtext(p_signature));

  -- Re-check after acquiring lock (double-checked locking)
  SELECT EXISTS(
    SELECT 1 FROM public.hmac_signatures WHERE signature = p_signature LIMIT 1
  ) INTO v_exists;

  IF v_exists THEN
    RETURN false;
  END IF;

  INSERT INTO public.hmac_signatures (signature, agent_name)
  VALUES (p_signature, p_agent_name);

  RETURN true; -- signature recorded successfully
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION public.hmac_check_and_record(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hmac_check_and_record(text, text) TO service_role;
