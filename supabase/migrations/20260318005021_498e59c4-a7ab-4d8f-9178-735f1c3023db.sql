-- P-014: Set valid_until on agent signing keys for rotation policy (90-day expiry)
UPDATE agent_signing_keys 
SET valid_until = created_at + interval '90 days'
WHERE valid_until IS NULL AND is_active = true;

-- Create trigger to auto-set valid_until on new keys
CREATE OR REPLACE FUNCTION public.set_signing_key_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.valid_until IS NULL THEN
    NEW.valid_until := NEW.created_at + interval '90 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_signing_key_expiry ON public.agent_signing_keys;
CREATE TRIGGER trg_set_signing_key_expiry
  BEFORE INSERT ON public.agent_signing_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_signing_key_expiry();

-- Revoke from PUBLIC
REVOKE EXECUTE ON FUNCTION public.set_signing_key_expiry() FROM PUBLIC;

-- P-003 enhancement: Auto-revoke tokens when agent is archived
CREATE OR REPLACE FUNCTION public.revoke_tokens_on_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status != 'archived' THEN
    UPDATE agent_tokens SET is_active = false
    WHERE agent_id = NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revoke_tokens_on_archive ON public.agents;
CREATE TRIGGER trg_revoke_tokens_on_archive
  AFTER UPDATE ON public.agents
  FOR EACH ROW
  WHEN (NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived')
  EXECUTE FUNCTION public.revoke_tokens_on_archive();

REVOKE EXECUTE ON FUNCTION public.revoke_tokens_on_archive() FROM PUBLIC