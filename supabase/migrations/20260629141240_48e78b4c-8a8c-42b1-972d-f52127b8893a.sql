
CREATE OR REPLACE FUNCTION public.generate_scim_api_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  RETURN 'cybershield_scim_' || encode(extensions.gen_random_bytes(32), 'hex');
END;
$function$;
