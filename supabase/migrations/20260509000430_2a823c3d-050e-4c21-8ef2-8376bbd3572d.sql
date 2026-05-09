ALTER FUNCTION public.rotate_hmac_signatures() SET search_path = public;
REVOKE ALL ON FUNCTION public.rotate_hmac_signatures() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_hmac_signatures() TO service_role;
