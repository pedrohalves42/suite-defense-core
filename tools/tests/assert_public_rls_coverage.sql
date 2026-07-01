-- =====================================================================
-- D21-B — Public RLS Coverage Gate
-- =====================================================================
-- Invariant:
--   Every base table (relkind = 'r') and partitioned table (relkind = 'p')
--   in the `public` schema MUST have Row Level Security ENABLED.
--
-- Why:
--   HF-RLS-01 exposed that `create_monthly_partitions` produces
--   "insecure-by-default" partitions when `ensure_partition_rls()` is not
--   invoked. This guard turns that class of regression into a CI failure
--   so no future migration can reintroduce a public table/partition with
--   RLS = off.
--
-- Behaviour:
--   - Runs via .github/workflows/sql-invariants.yml (ON_ERROR_STOP=1).
--   - RAISE EXCEPTION on any offender -> psql exits non-zero -> merge blocked.
--   - NEVER runs in warning mode.
--
-- Exceptions (allowlist):
--   The allowlist is embedded below as a VALUES clause so every entry is
--   reviewed in a pull request. Each row MUST include a justification.
--   To exempt a table, append a row with (schema, name, reason, reference).
--   An empty allowlist is the desired steady state.
-- =====================================================================

DO $$
DECLARE
  offender_count integer;
  offender_list  text;
BEGIN
  -- ---- Allowlist ----------------------------------------------------
  -- Format: (schema, name, reason, reference)
  -- Keep empty unless there is a documented, reviewed exception.
  CREATE TEMP TABLE _rls_allowlist (
    schema_name text NOT NULL,
    object_name text NOT NULL,
    reason      text NOT NULL,
    reference   text NOT NULL,
    PRIMARY KEY (schema_name, object_name)
  ) ON COMMIT DROP;

  -- Intentionally empty. Add rows here ONLY with review + reference.
  -- Example (do not uncomment without approval):
  -- INSERT INTO _rls_allowlist VALUES
  --   ('public','some_table','public catalog, no tenant data','docs/audits/…');

  -- ---- Detection ----------------------------------------------------
  WITH offenders AS (
    SELECT
      n.nspname AS schema_name,
      c.relname AS object_name,
      CASE
        WHEN c.relkind = 'p' THEN 'partitioned_table'
        WHEN c.relispartition THEN 'partition'
        ELSE 'table'
      END AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')      -- regular + partitioned tables
      AND c.relpersistence = 'p'      -- skip TEMP/UNLOGGED
      AND c.relrowsecurity = false
      AND NOT EXISTS (
        SELECT 1 FROM _rls_allowlist a
        WHERE a.schema_name = n.nspname
          AND a.object_name = c.relname
      )
  )
  SELECT
    count(*),
    string_agg(
      format('  - %s.%s (%s)', schema_name, object_name, kind),
      E'\n' ORDER BY object_name
    )
  INTO offender_count, offender_list
  FROM offenders;

  IF offender_count > 0 THEN
    RAISE EXCEPTION E'D21-B RLS COVERAGE VIOLATION\n%s public table(s)/partition(s) without RLS:\n%\n\nFix: enable RLS + attach the canonical tenant policy, OR add an explicit entry to the allowlist in this file with a justification.',
      offender_count, offender_list;
  END IF;

  RAISE NOTICE 'PASS: 0 public tables/partitions without RLS (allowlist size = %).',
    (SELECT count(*) FROM _rls_allowlist);
END $$;
