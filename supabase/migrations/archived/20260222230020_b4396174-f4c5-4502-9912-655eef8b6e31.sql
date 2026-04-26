
-- Fix auto_provision_signing_key to include key_fingerprint (NOT NULL constraint)
CREATE OR REPLACE FUNCTION public.auto_provision_signing_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    INSERT INTO agent_signing_keys (agent_id, public_key, key_fingerprint, algorithm, version)
    SELECT NEW.id, 'pending-agent-upload', 
           encode(sha256(convert_to(NEW.id::text || ':pending', 'UTF8')), 'hex'),
           'ECDSA-P256', 1
    WHERE NOT EXISTS (
      SELECT 1 FROM agent_signing_keys WHERE agent_id = NEW.id AND revoked_at IS NULL
    );
  END IF;
  RETURN NEW;
END;
$$;
