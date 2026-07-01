-- D21-C: RPC Governance Inventory (consumable)
--
-- Emits one TSV row per SECURITY DEFINER function in the public schema with:
--   name TAB owner TAB definer TAB grants TAB tenant_guard TAB auth_role TAB source_hash
--
-- Consumers and Status are added by the pipeline script that consumes this
-- output (tools/reports/generate_rpc_governance_inventory.py). This SQL is
-- the single source of truth for the DB-side facts — no interpretation here.
--
-- Contract for downstream:
--   - "grants" is a comma-separated list of roles with EXECUTE (e.g. "authenticated,service_role").
--     "PUBLIC" appears verbatim when the function grants to PUBLIC.
--   - "tenant_guard" is one of: assert_caller_tenant | active_tenant | auth_uid | none
--     (heuristic from source text; multiple matches keep the strongest guard in that order).
--   - "auth_role" is 'checked' if the source references auth.role()/auth.jwt(), else 'unchecked'.
--   - "source_hash" is md5 of prosrc — lets the report detect definitional drift week over week.

\pset format unaligned
\pset tuples_only on
\pset fieldsep '\t'
\pset footer off

WITH sd AS (
  SELECT
    p.oid,
    p.proname AS name,
    r.rolname AS owner,
    p.prosrc AS src,
    pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_authid r ON r.oid = p.proowner
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
),
grants AS (
  SELECT
    sd.oid,
    COALESCE(string_agg(DISTINCT g.grantee, ',' ORDER BY g.grantee), '') AS grantees
  FROM sd
  LEFT JOIN LATERAL (
    SELECT unnest(
      COALESCE(
        (SELECT array_agg(DISTINCT
                  CASE
                    WHEN acl.grantee = 0 THEN 'PUBLIC'
                    ELSE (SELECT rolname FROM pg_authid WHERE oid = acl.grantee)
                  END)
         FROM aclexplode(sd_proc.proacl) AS acl
         WHERE acl.privilege_type = 'EXECUTE'),
        ARRAY[]::text[]
      )
    ) AS grantee
    FROM pg_proc sd_proc
    WHERE sd_proc.oid = sd.oid
  ) g ON true
  GROUP BY sd.oid
)
SELECT
  sd.name || '(' || sd.args || ')' AS rpc,
  sd.owner,
  'SECURITY DEFINER' AS definer,
  COALESCE(NULLIF(g.grantees, ''), '(none)') AS grants,
  CASE
    WHEN sd.src ~* '_assert_caller_tenant\s*\(' THEN 'assert_caller_tenant'
    WHEN sd.src ~* 'get_active_tenant_id\s*\(' THEN 'active_tenant'
    WHEN sd.src ~* 'auth\.uid\s*\(' THEN 'auth_uid'
    ELSE 'none'
  END AS tenant_guard,
  CASE
    WHEN sd.src ~* 'auth\.(role|jwt)\s*\(' THEN 'checked'
    ELSE 'unchecked'
  END AS auth_role,
  md5(sd.src) AS source_hash
FROM sd
LEFT JOIN grants g ON g.oid = sd.oid
ORDER BY sd.name, sd.args;
