-- CI Validation: Verify agent_releases table has proper RLS for authenticated users
-- This test ensures non-super-admin users can access active releases

DO $$
DECLARE
  policy_count integer;
  has_authenticated_policy boolean := false;
BEGIN
  -- Check if there's a policy for authenticated users on SELECT
  SELECT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relname = 'agent_releases'
    AND p.polcmd = 'r'  -- SELECT command
    AND (
      p.polname LIKE '%authenticated%'
      OR pg_get_expr(p.polqual, p.polrelid) LIKE '%is_active%'
    )
  ) INTO has_authenticated_policy;
  
  IF NOT has_authenticated_policy THEN
    RAISE EXCEPTION 'SECURITY CONFIG ERROR: agent_releases table missing authenticated user SELECT policy';
  END IF;
  
  -- Verify RLS is enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relname = 'agent_releases'
    AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'SECURITY CONFIG ERROR: agent_releases table does not have RLS enabled';
  END IF;
  
  RAISE NOTICE 'PASS: agent_releases RLS configuration is correct';
END $$;
