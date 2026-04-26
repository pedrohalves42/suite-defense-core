
-- Fix search_path warning for prevent_orphan_tokens
CREATE OR REPLACE FUNCTION prevent_orphan_tokens()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status != 'archived' THEN
    UPDATE public.agent_tokens 
    SET is_active = false,
        updated_at = now()
    WHERE agent_id = NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
