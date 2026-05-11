DO $$ 
DECLARE 
  r record;
BEGIN
  -- Grant execute on all functions starting with get_ and acknowledge_ that are in public schema
  FOR r IN 
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND (p.proname LIKE 'get_%' OR p.proname LIKE 'acknowledge_%' OR p.proname = 'update_session_activity')
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || quote_ident(r.nspname) || '.' || quote_ident(r.proname) || '(' || r.args || ') TO authenticated, service_role';
  END LOOP;
END $$;
