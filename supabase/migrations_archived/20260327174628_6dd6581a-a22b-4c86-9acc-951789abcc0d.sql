
-- Idempotent fix: Add SET search_path = public to all SECURITY DEFINER functions in public schema
-- that are missing it. This prevents search_path hijacking attacks.
DO $$
DECLARE
  func_record RECORD;
  current_config text[];
  has_search_path boolean;
BEGIN
  FOR func_record IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true  -- SECURITY DEFINER
  LOOP
    -- Check if search_path is already set
    current_config := (SELECT proconfig FROM pg_proc WHERE oid = func_record.oid);
    has_search_path := false;
    
    IF current_config IS NOT NULL THEN
      FOR i IN 1..array_length(current_config, 1) LOOP
        IF current_config[i] LIKE 'search_path=%' THEN
          has_search_path := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    IF NOT has_search_path THEN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public',
        func_record.proname,
        func_record.args
      );
      RAISE NOTICE 'Fixed: public.%(%)', func_record.proname, func_record.args;
    END IF;
  END LOOP;
END;
$$;
