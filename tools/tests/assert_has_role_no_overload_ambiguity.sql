-- =============================================================================
-- CI Guard: has_role() overloads must never be PostgREST-ambiguous
-- Ref: HF-RPC-OVERLOAD-AUDIT-01
--
-- Symptom prevented: PostgREST returns PGRST203 ("Could not choose the best
-- candidate function") when a caller sends {_user_id, _role} because the
-- 3-arg overload declared _tenant_id with DEFAULT NULL. Two overloads that
-- overlap on arity break both Edge callers and RLS evaluation.
--
-- Invariant enforced:
--   * exactly one overload has_role(uuid, app_role)             (global check)
--   * exactly one overload has_role(uuid, text,  uuid)          (per-tenant)
--   * neither overload declares any parameter default
-- =============================================================================

DO $$
DECLARE
  v_two_arg    int;
  v_three_arg  int;
  v_defaults   int;
BEGIN
  SELECT COUNT(*)
    INTO v_two_arg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'has_role'
     AND pg_get_function_identity_arguments(p.oid) = '_user_id uuid, _role app_role';

  SELECT COUNT(*), COALESCE(MAX(pronargdefaults), 0)
    INTO v_three_arg, v_defaults
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'has_role'
     AND pg_get_function_identity_arguments(p.oid) = '_user_id uuid, _role text, _tenant_id uuid';

  IF v_two_arg <> 1 THEN
    RAISE EXCEPTION
      'HAS_ROLE OVERLOAD GUARD: expected exactly 1 two-arg has_role(uuid, app_role), found %',
      v_two_arg;
  END IF;

  IF v_three_arg <> 1 THEN
    RAISE EXCEPTION
      'HAS_ROLE OVERLOAD GUARD: expected exactly 1 three-arg has_role(uuid, text, uuid), found %',
      v_three_arg;
  END IF;

  IF v_defaults <> 0 THEN
    RAISE EXCEPTION
      'HAS_ROLE OVERLOAD GUARD: three-arg has_role must not declare parameter defaults (found %). '
      'A default on _tenant_id reintroduces the PGRST203 ambiguity fixed by HF-RPC-OVERLOAD-AUDIT-01.',
      v_defaults;
  END IF;

  RAISE NOTICE 'HAS_ROLE OVERLOAD GUARD: passed (overloads are unambiguous)';
END $$;

SELECT 'has_role overload ambiguity check passed' AS result;
