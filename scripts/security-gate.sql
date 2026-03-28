-- =============================================================================
-- Security Gate: Validate RLS Hardening (ADR-023)
-- =============================================================================
-- This script validates that no dangerous public policies exist.
-- Run during CI/CD or manual security audits.
-- 
-- Expected result: No dangerous policies found
-- On failure: Lists all policies that need remediation
-- =============================================================================

DO $$
DECLARE
  dangerous_policies RECORD;
  policy_count integer := 0;
  error_messages text := '';
BEGIN
  -- ==========================================================================
  -- CHECK 1: No public role UPDATE/DELETE/ALL policies with USING(true)
  -- ==========================================================================
  
  FOR dangerous_policies IN
    SELECT 
      schemaname,
      tablename,
      policyname,
      roles::text as granted_roles,
      cmd,
      qual::text as using_clause
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text LIKE '%public%'
      AND cmd IN ('UPDATE', 'DELETE', 'ALL')
      AND (qual::text = 'true' OR qual IS NULL)
  LOOP
    policy_count := policy_count + 1;
    error_messages := error_messages || format(
      E'\n  - %s.%s: Policy "%s" (%s) with USING(true)',
      dangerous_policies.schemaname,
      dangerous_policies.tablename,
      dangerous_policies.policyname,
      dangerous_policies.cmd
    );
  END LOOP;

  -- ==========================================================================
  -- CHECK 2: No public role INSERT policies with WITH CHECK(true)
  -- ==========================================================================
  
  FOR dangerous_policies IN
    SELECT 
      schemaname,
      tablename,
      policyname,
      roles::text as granted_roles,
      with_check::text as with_check_clause
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text LIKE '%public%'
      AND cmd = 'INSERT'
      AND (with_check::text = 'true' OR with_check IS NULL)
  LOOP
    policy_count := policy_count + 1;
    error_messages := error_messages || format(
      E'\n  - %s.%s: Policy "%s" (INSERT) with WITH CHECK(true)',
      dangerous_policies.schemaname,
      dangerous_policies.tablename,
      dangerous_policies.policyname
    );
  END LOOP;

  -- ==========================================================================
  -- CHECK 3: Secure views exist
  -- ==========================================================================
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' AND table_name = 'agents_public'
  ) THEN
    policy_count := policy_count + 1;
    error_messages := error_messages || E'\n  - Missing view: agents_public (required by ADR-023)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' AND table_name = 'invites_safe'
  ) THEN
    policy_count := policy_count + 1;
    error_messages := error_messages || E'\n  - Missing view: invites_safe (required by ADR-023)';
  END IF;

  -- ==========================================================================
  -- RESULT
  -- ==========================================================================
  
  IF policy_count > 0 THEN
    RAISE EXCEPTION 
      E'\n=== SECURITY GATE FAILED ===\nFound % dangerous configuration(s):%s\n\nRemediation: See ADR-023 for hardening instructions.',
      policy_count,
      error_messages;
  ELSE
    RAISE NOTICE E'\n=== SECURITY GATE PASSED ===\n? No dangerous public policies found\n? Secure views exist (agents_public, invites_safe)\n? ADR-023 compliance verified';
  END IF;
END;
$$;

-- =============================================================================
-- Additional validation query (for manual inspection)
-- =============================================================================
-- SELECT 
--   schemaname,
--   tablename,
--   policyname,
--   roles::text,
--   cmd,
--   qual::text as using_clause,
--   with_check::text as with_check_clause
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND roles::text LIKE '%public%'
-- ORDER BY tablename, cmd;
