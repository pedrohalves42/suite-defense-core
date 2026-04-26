DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (
        SELECT n.nspname, p.proname, pg_get_function_arguments(p.oid) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public' 
        AND p.proconfig IS NULL
    ) LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', r.nspname, r.proname, r.args);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not alter function %.%: %', r.nspname, r.proname, SQLERRM;
        END;
    END LOOP;
END $$;