DO $$
DECLARE
  r RECORD;
  fixed_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_options_to_table(p.proconfig)
        WHERE option_name = 'search_path'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      r.nspname, r.proname, r.args
    );
    fixed_count := fixed_count + 1;
    RAISE NOTICE 'Fixed: %.%(%)', r.nspname, r.proname, r.args;
  END LOOP;
  RAISE NOTICE 'Total fixed: %', fixed_count;
END $$;