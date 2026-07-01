-- D20-Gate-4 Guard: SECURITY DEFINER function OWNER must be `postgres`.
--
-- Rationale: SECURITY DEFINER runs with the OWNER's privileges. If a function
-- is owned by a role with narrower or broader privileges than `postgres`, the
-- authorization contract shifts silently — often in ways that bypass RLS or
-- grant unintended access. Locking the owner to `postgres` makes ownership a
-- one-line, auditable invariant.
--
-- Baseline (2026-07): 438/438 SECURITY DEFINER functions in `public` are owned
-- by `postgres`. This guard freezes that state.
--
-- Usage: run via CI. Fails with the list of offending functions.

DO $$
DECLARE
  offenders_count integer;
  offender_list text;
BEGIN
  WITH sd AS (
    SELECT n.nspname AS schema,
           p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args,
           r.rolname AS owner
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_authid r ON r.oid = p.proowner
    WHERE p.prosecdef = true
      AND n.nspname = 'public'
  )
  SELECT count(*),
         string_agg(schema || '.' || name || '(' || args || ') OWNER=' || owner, E'\n  ')
    INTO offenders_count, offender_list
  FROM sd
  WHERE owner <> 'postgres';

  IF offenders_count > 0 THEN
    RAISE EXCEPTION E'D20-Gate-4 violation: % SECURITY DEFINER function(s) in public with unexpected OWNER (expected: postgres):\n  %',
      offenders_count, offender_list;
  END IF;

  RAISE NOTICE 'D20-Gate-4 guard OK: all public SECURITY DEFINER functions owned by postgres.';
END $$;
