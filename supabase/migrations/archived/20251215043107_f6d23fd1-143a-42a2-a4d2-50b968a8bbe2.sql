-- Fix linter warning: recreate view with security_invoker=on
DROP VIEW IF EXISTS public.hmac_signatures CASCADE;

CREATE VIEW public.hmac_signatures 
WITH (security_invoker=on) AS
SELECT id, signature, agent_name, used_at
FROM public.hmac_signatures_2025_12
UNION ALL
SELECT id, signature, agent_name, used_at
FROM public.hmac_signatures_2026_01;

-- Recreate INSTEAD OF INSERT trigger
DROP TRIGGER IF EXISTS tr_hmac_signatures_insert ON public.hmac_signatures;
CREATE TRIGGER tr_hmac_signatures_insert
  INSTEAD OF INSERT ON public.hmac_signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.hmac_signatures_insert_trigger();

-- Recreate INSTEAD OF DELETE trigger  
DROP TRIGGER IF EXISTS tr_hmac_signatures_delete ON public.hmac_signatures;
CREATE TRIGGER tr_hmac_signatures_delete
  INSTEAD OF DELETE ON public.hmac_signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.hmac_signatures_delete_trigger();

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.hmac_signatures TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.hmac_signatures TO service_role;