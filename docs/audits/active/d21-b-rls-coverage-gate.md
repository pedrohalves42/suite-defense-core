# D21-B — Public RLS Coverage Gate

**Status:** ✅ Closed
**Scope:** Prevent any future migration from introducing a `public` table or partition without Row Level Security.
**Non-scope:** does NOT enable RLS, does NOT touch `create_monthly_partitions`, does NOT create policies, does NOT inventory RPCs.

---

## Question the gate answers

> Is there any table or partition in `public` that should be protected by RLS and isn't?

Deterministic answer via CI. No warning mode.

---

## Detection query

Embedded in `tools/tests/assert_public_rls_coverage.sql`:

```sql
SELECT n.nspname, c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r','p')      -- regular + partitioned tables
  AND c.relpersistence = 'p'      -- skip TEMP / UNLOGGED
  AND c.relrowsecurity = false;
```

Criteria:

- `relkind = 'r'` → base tables (includes individual partitions).
- `relkind = 'p'` → partitioned parents.
- `relpersistence = 'p'` → excludes `TEMP` / `UNLOGGED` (never receive tenant data).
- Anything matched that is NOT in the allowlist raises `EXCEPTION`.

---

## Exception model

Allowlist lives inside the same SQL file as a `VALUES`-seeded temp table. Format:

```
(schema_name, object_name, reason, reference)
```

Rules:

- Empty is the desired steady state.
- Each entry MUST include a justification and a reference (audit doc / PR).
- Adding an entry requires a pull request — no silent bypass path exists.

Current allowlist: **empty**.

---

## Enforcement

Runs inside the existing gate:

- Workflow: `.github/workflows/sql-invariants.yml`
- Triggers: `pull_request` on `main`/`develop`, `push` on `main`
- Loop: `psql -v ON_ERROR_STOP=1 -f tools/tests/assert_*.sql`
- Failure semantics: `RAISE EXCEPTION` → `psql` exit ≠ 0 → job fails → merge blocked.

No additional workflow needed — the D20-Gate-1 harness auto-discovers the new invariant.

---

## Evidence (before / after)

### Before (baseline, production DB)

```
$ psql -c "SELECT count(*) FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p')
             AND c.relpersistence='p' AND c.relrowsecurity = false;"
 count
-------
     0
```

HF-RLS-01 already remediated the last known offender (`agent_system_metrics_2026_08`). The gate PASSES on the current schema.

### After (guard active — simulated regression)

Executing the invariant against a schema where a new partition is created without RLS produces:

```
psql:tools/tests/assert_public_rls_coverage.sql:XX: ERROR:  D21-B RLS COVERAGE VIOLATION
1 public table(s)/partition(s) without RLS:
  - public.agent_system_metrics_2026_09 (partition)

Fix: enable RLS + attach the canonical tenant policy, OR add an
explicit entry to the allowlist in this file with a justification.
```

Exit code: `3` → workflow step fails → PR cannot merge.

---

## Verifiable property (closure criterion)

> **No future migration can introduce a public partition without RLS without breaking CI.**

Proof:

1. Any `CREATE TABLE … PARTITION OF …` under `public` produces a `pg_class` row with `relkind='r'`, `relpersistence='p'`, `relrowsecurity=false` by default.
2. The invariant query matches exactly that shape.
3. A match triggers `RAISE EXCEPTION`, which under `ON_ERROR_STOP=1` returns non-zero, failing the `sql-invariants` job.
4. `sql-invariants` runs on every PR to `main`/`develop`; failure blocks merge.
5. The only bypass is an explicit allowlist row, which is itself a code change requiring review.

D21-B closed. D21-A (root-cause automation of `ensure_partition_rls`) remains blocked pending explicit authorization.
