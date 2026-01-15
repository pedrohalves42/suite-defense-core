-- Fix: Add user_id to profiles_public view for profile lookups
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT 
  id,
  user_id,
  username,
  full_name,
  created_at
FROM public.profiles;

-- Grant access to authenticated users only
REVOKE ALL ON public.profiles_public FROM anon;
GRANT SELECT ON public.profiles_public TO authenticated;

COMMENT ON VIEW public.profiles_public IS 'Public-safe profile data with security_invoker enabled - ADR-024';