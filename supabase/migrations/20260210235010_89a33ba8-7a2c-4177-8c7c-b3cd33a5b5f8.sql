
-- =====================================================
-- V-206: BULK MIGRATION public ? authenticated
-- Preserves all USING/WITH CHECK clauses exactly as-is
-- Only changes the granted role from public to authenticated
-- =====================================================

DO $$
DECLARE
  pol RECORD;
  new_name TEXT;
  ddl TEXT;
  migrated INT := 0;
  skipped INT := 0;
BEGIN
  FOR pol IN
    SELECT 
      schemaname,
      tablename,
      policyname,
      permissive,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text = '{public}'
      AND cmd != 'SELECT'
      AND policyname NOT LIKE '%service%'
      AND policyname NOT LIKE '%Service%'
    ORDER BY tablename, policyname
  LOOP
    -- Build new policy name (append _v206 to avoid collision)
    new_name := pol.policyname || '_v206';
    
    -- Truncate if too long (max 63 chars for pg identifiers)
    IF length(new_name) > 63 THEN
      new_name := left(pol.policyname, 58) || '_v206';
    END IF;

    BEGIN
      -- Build CREATE POLICY DDL
      ddl := format('CREATE POLICY %I ON %I.%I FOR %s TO authenticated',
        new_name, pol.schemaname, pol.tablename, pol.cmd);

      -- Add USING clause
      IF pol.qual IS NOT NULL THEN
        ddl := ddl || ' USING (' || pol.qual || ')';
      END IF;

      -- Add WITH CHECK clause
      IF pol.with_check IS NOT NULL THEN
        ddl := ddl || ' WITH CHECK (' || pol.with_check || ')';
      END IF;

      -- Execute creation of new policy
      EXECUTE ddl;

      -- Drop old policy
      EXECUTE format('DROP POLICY %I ON %I.%I',
        pol.policyname, pol.schemaname, pol.tablename);

      migrated := migrated + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to migrate policy % on %: %', pol.policyname, pol.tablename, SQLERRM;
      skipped := skipped + 1;
    END;
  END LOOP;

  RAISE NOTICE 'V-206 COMPLETE: % policies migrated, % skipped', migrated, skipped;
END $$;
