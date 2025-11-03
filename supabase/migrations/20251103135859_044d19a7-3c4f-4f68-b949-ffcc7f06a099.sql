-- Corrigir função cleanup_expired_keys com search_path seguro
CREATE OR REPLACE FUNCTION public.cleanup_expired_keys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.enrollment_keys
  SET is_active = false
  WHERE expires_at < now() AND is_active = true;
END;
$$;