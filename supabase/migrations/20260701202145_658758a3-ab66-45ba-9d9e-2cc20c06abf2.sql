-- D21-A: eliminate insecure-by-default partitions.
-- Wires ensure_partition_rls + assert_partition_rls into create_monthly_partitions
-- so every partition is created inside a transaction that also enables RLS
-- and validates the post-condition. If either step fails, the whole function
-- rolls back (plpgsql = single transaction) and no partition survives.

-- ---------------------------------------------------------------
-- 1) NEW: assert_partition_rls(text)
--    Post-condition validator. RAISE EXCEPTION on any violation.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_partition_rls(p_partition_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_oid oid;
  v_rls boolean;
  v_policies integer;
BEGIN
  SELECT c.oid, c.relrowsecurity
    INTO v_oid, v_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = p_partition_name
    AND c.relkind = 'r';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'D21-A assert_partition_rls: partition public.% does not exist', p_partition_name;
  END IF;

  IF NOT v_rls THEN
    RAISE EXCEPTION 'D21-A assert_partition_rls: partition public.% has RLS OFF', p_partition_name;
  END IF;

  SELECT count(*) INTO v_policies FROM pg_policy WHERE polrelid = v_oid;

  IF v_policies = 0 THEN
    RAISE EXCEPTION 'D21-A assert_partition_rls: partition public.% has 0 policies', p_partition_name;
  END IF;
END;
$function$;

ALTER FUNCTION public.assert_partition_rls(text) OWNER TO postgres;

-- ---------------------------------------------------------------
-- 2) NEW OVERLOAD: ensure_partition_rls(text)
--    Scoped variant of the existing sweep. Enables RLS if OFF and
--    propagates parent policies when the partition has none.
--    The zero-arg version is preserved for ops backfill.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_partition_rls(p_partition_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  rec RECORD;
  pol RECORD;
BEGIN
  SELECT c.relname AS partition_name, c.oid AS partition_oid, p.relname AS parent_name
    INTO rec
  FROM pg_inherits i
  JOIN pg_class c ON c.oid = i.inhrelid
  JOIN pg_class p ON p.oid = i.inhparent
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname = p_partition_name;

  IF rec.partition_oid IS NULL THEN
    RAISE EXCEPTION 'D21-A ensure_partition_rls: partition public.% not found or not a partition', p_partition_name;
  END IF;

  -- Enable RLS if not already
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = rec.partition_oid) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.partition_name);
  END IF;

  -- Propagate policies from parent if partition has none
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = rec.partition_oid) THEN
    FOR pol IN
      SELECT polname, polcmd, polroles, polpermissive, polqual, polwithcheck
      FROM pg_policy
      WHERE polrelid = (
        SELECT oid FROM pg_class
        WHERE relname = rec.parent_name
          AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      )
    LOOP
      DECLARE
        cmd_text TEXT;
        roles_text TEXT;
        using_clause TEXT := '';
        check_clause TEXT := '';
        permissive_text TEXT;
      BEGIN
        cmd_text := CASE pol.polcmd
          WHEN 'r' THEN 'SELECT'
          WHEN 'a' THEN 'INSERT'
          WHEN 'w' THEN 'UPDATE'
          WHEN 'd' THEN 'DELETE'
          WHEN '*' THEN 'ALL'
        END;

        SELECT string_agg(rolname, ', ')
          INTO roles_text
        FROM pg_roles
        WHERE oid = ANY(pol.polroles);

        permissive_text := CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

        IF pol.polqual IS NOT NULL THEN
          using_clause := format(' USING (%s)', pg_get_expr(pol.polqual, rec.partition_oid, true));
        END IF;

        IF pol.polwithcheck IS NOT NULL THEN
          check_clause := format(' WITH CHECK (%s)', pg_get_expr(pol.polwithcheck, rec.partition_oid, true));
        END IF;

        EXECUTE format(
          'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
          pol.polname, rec.partition_name, permissive_text, cmd_text, roles_text, using_clause, check_clause
        );
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END LOOP;
  END IF;
END;
$function$;

ALTER FUNCTION public.ensure_partition_rls(text) OWNER TO postgres;

-- ---------------------------------------------------------------
-- 3) MODIFY: create_monthly_partitions — wire ensure + assert
--    Same signature, same return type, same external behaviour.
--    Only change: two PERFORM calls after each CREATE TABLE.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_monthly_partitions(
  p_table_name text,
  p_partition_column text,
  p_months_ahead integer DEFAULT 3
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_start DATE;
  v_end DATE;
  v_partition_name TEXT;
  v_created INTEGER := 0;
BEGIN
  FOR i IN 0..p_months_ahead LOOP
    v_start := date_trunc('month', now()) + (i || ' months')::interval;
    v_end := v_start + '1 month'::interval;
    v_partition_name := p_table_name || '_' || to_char(v_start, 'YYYY_MM');

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_partition_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
        v_partition_name, p_table_name, v_start, v_end
      );

      -- D21-A: partition MUST be born protected.
      -- Any failure below aborts the whole function (single tx) → rollback.
      PERFORM public.ensure_partition_rls(v_partition_name);
      PERFORM public.assert_partition_rls(v_partition_name);

      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN v_created;
END;
$function$;

ALTER FUNCTION public.create_monthly_partitions(text, text, integer) OWNER TO postgres;