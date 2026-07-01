-- D20-A Guard: every SECURITY DEFINER function in the public schema must set an
-- explicit `search_path`. Implicit search paths allow schema-shadowing attacks
-- where an attacker creates a namespace-prefixed function or table and hijacks
-- privileged execution.
--
-- Usage: run via CI. Fails with a listing of offending functions.

DO $$
DECLARE
  offenders_count integer;
  offender_list text;
BEGIN
  WITH sd AS (
    SELECT n.nspname AS schema,
           p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args,
           EXISTS (
             SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
             WHERE c LIKE 'search_path=%'
           ) AS has_sp
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname = 'public'
  )
  SELECT count(*),
         string_agg(schema || '.' || name || '(' || args || ')', E'\n  ')
    INTO offenders_count, offender_list
  FROM sd
  WHERE NOT has_sp;

  IF offenders_count > 0 THEN
    RAISE EXCEPTION E'D20-A violation: % SECURITY DEFINER function(s) in public without SET search_path:\n  %',
      offenders_count, offender_list;
  END IF;

  RAISE NOTICE 'D20-A guard OK: all public SECURITY DEFINER functions have explicit search_path.';
END $$;
