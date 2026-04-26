
-- =============================================================================
-- V-307: Reusable tenant guard + apply to ALL 44 vulnerable RPCs
-- =============================================================================

-- Step 1: Create a reusable tenant assertion function
CREATE OR REPLACE FUNCTION public._assert_caller_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED: p_tenant_id cannot be null (INV-001)';
  END IF;
  IF NOT is_current_super_admin() 
     AND (get_active_tenant_id() IS NULL OR p_tenant_id IS DISTINCT FROM get_active_tenant_id()) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: Caller tenant % does not match requested tenant % (INV-001)', 
      get_active_tenant_id(), p_tenant_id;
  END IF;
END;
$fn$;

-- Restrict to authenticated + service_role only
REVOKE EXECUTE ON FUNCTION public._assert_caller_tenant(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._assert_caller_tenant(uuid) TO authenticated, service_role;

-- Step 2: For each of the 44 RPCs, we inject the guard as the FIRST statement.
-- Strategy: We wrap the existing body with PERFORM _assert_caller_tenant(p_tenant_id) at the top.
-- Since we can't ALTER function body, we create a trigger-based approach using a wrapper.
-- 
-- Actually the most robust approach: Create a BEFORE-call validation trigger is not possible for functions.
-- Best approach: Use a security policy function that each RPC calls.
-- We'll demonstrate the pattern is already working via get_agents_list (V-302 fix).
-- For the remaining 43, we apply the same pattern via CREATE OR REPLACE.

-- Since replacing 43 function bodies requires knowing each body, and we can't read them all here,
-- we'll use a PL/pgSQL block to dynamically inject the guard into each function.

-- Dynamic injection approach: Add a wrapper layer
-- For each function, prepend PERFORM _assert_caller_tenant(p_tenant_id);

DO $inject$
DECLARE
  func_record RECORD;
  func_body text;
  new_body text;
  guard_line text := 'PERFORM public._assert_caller_tenant(p_tenant_id);';
  func_def text;
BEGIN
  FOR func_record IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
    AND p.prosecdef = true
    AND pg_get_function_identity_arguments(p.oid) LIKE '%p_tenant_id%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%_assert_caller_tenant%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%TENANT_MISMATCH%'
    AND p.proname != '_assert_caller_tenant'
  LOOP
    -- Get full function definition
    func_def := pg_get_functiondef(func_record.oid);
    
    -- Inject guard after BEGIN (first occurrence)
    -- Replace first 'BEGIN' with 'BEGIN\n  PERFORM _assert_caller_tenant(p_tenant_id);'
    -- We need to be careful to only replace the outermost BEGIN
    
    -- Find position of first BEGIN after AS
    IF func_def LIKE '%BEGIN%' THEN
      -- Replace the first BEGIN with BEGIN + guard
      func_def := regexp_replace(
        func_def, 
        'BEGIN\s*\n', 
        E'BEGIN\n  PERFORM public._assert_caller_tenant(p_tenant_id);\n',
        'i'  -- case insensitive, first match only
      );
      
      EXECUTE func_def;
      RAISE NOTICE 'Injected tenant guard into: %(%)', func_record.proname, func_record.args;
    ELSE
      RAISE WARNING 'Could not inject guard into: % (no BEGIN found)', func_record.proname;
    END IF;
  END LOOP;
END;
$inject$;
