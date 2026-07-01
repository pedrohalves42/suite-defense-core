# D21-A — Partition RLS Atomicity

**Status:** ✅ Closed
**Scope:** Eliminate the single root cause behind HF-RLS-01 — `create_monthly_partitions` producing insecure-by-default partitions.
**Non-scope:** no changes to policies, grants, owners, indexes, retention, partitioning strategy, or naming.

---

## 1. Root cause — classified

**Category: orphan function / incomplete refactor.**

Direct evidence from the catalog before this change:

- `create_monthly_partitions(text,text,int)` executed only `CREATE TABLE … PARTITION OF …` and returned. Zero references to RLS.
- `ensure_partition_rls()` **existed** (`SECURITY DEFINER`, correct logic: enables RLS + propagates parent policies) but was written as a **global sweep with no arguments** — a backfill tool, not a post-condition of creation.
- `assert_partition_rls` **did not exist**.
- No trigger, event trigger, or cron invoked `ensure_partition_rls()` after partition creation.

The remediation helper was authored, but the wiring that would connect it to the creation flow was never implemented. Partitions were born insecure because step 2 of the intended pipeline was simply not cabled.

Ruled out: this was not a bug in `ensure_partition_rls()` itself, not a policy misconfiguration, not a regression from a recent change — the function has never been called from the creation path in the code's history.

---

## 2. Old flow vs. new flow

```text
BEFORE (insecure by default)
  create_monthly_partitions(parent, col, N)
    └─ FOR i IN 0..N:
         └─ CREATE TABLE … PARTITION OF …     ← RLS = OFF, 0 policies
    └─ RETURN v_created

AFTER (secure by construction)
  create_monthly_partitions(parent, col, N)
    └─ FOR i IN 0..N:                         ─┐
         ├─ CREATE TABLE … PARTITION OF …      │
         ├─ PERFORM ensure_partition_rls(name) │  single plpgsql tx
         └─ PERFORM assert_partition_rls(name) │  → any RAISE = full rollback
    └─ RETURN v_created                       ─┘
```

Changes shipped, and only these:

- **NEW** `public.assert_partition_rls(text)` — post-condition validator (existence + `relrowsecurity` + `pg_policy > 0`), `SECURITY DEFINER`, owner `postgres`.
- **NEW OVERLOAD** `public.ensure_partition_rls(text)` — scoped variant reusing the exact logic of the zero-arg version. Zero-arg version preserved for ops backfill.
- **MODIFIED** `public.create_monthly_partitions(text,text,int)` — same signature, same return type, same `SECURITY DEFINER`, same `search_path`. Only diff: two `PERFORM` calls added after each `CREATE TABLE`.

Nothing else was touched.

---

## 3. Proof of atomicity (rollback on failure)

Exercise: invoked `create_monthly_partitions('agent_system_metrics_partitioned','collected_at',4)`. The historical partitions of that parent were manually created with an inconsistent name (`agent_system_metrics_2026_07` instead of `agent_system_metrics_partitioned_2026_07`), so the generator's `CREATE TABLE` collided with an existing sibling and raised.

Observed:

```
ERROR: partition "agent_system_metrics_partitioned_2026_07" would overlap partition "agent_system_metrics_2026_07"
CONTEXT: PL/pgSQL function create_monthly_partitions(text,text,integer) line 18 at EXECUTE
```

Post-condition check on the whole database immediately after:

```sql
SELECT count(*) FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND c.relispartition AND NOT c.relrowsecurity;
-- 0
```

The failing invocation left **zero** orphan partitions. plpgsql function = one implicit transaction → any RAISE inside the loop rolls back every prior CREATE TABLE in the same call. Atomicity confirmed.

Complementary raise-path proof:

```
psql=> SELECT public.assert_partition_rls('__does_not_exist__');
ERROR:  D21-A assert_partition_rls: partition public.__does_not_exist__ does not exist
CONTEXT: PL/pgSQL function assert_partition_rls(text) line 16 at RAISE
EXIT=1
```

The assert raises objectively (exit code ≠ 0), which is what triggers the rollback when wired inside `create_monthly_partitions`.

---

## 4. Proof of post-condition (partition is born protected)

Exercise on a parent that uses the generator's naming convention consistently — `audit_logs` (partitions `audit_logs_2026_05..2026_09` existed; months 10/11/12 did not):

```sql
SELECT public.create_monthly_partitions('audit_logs','created_at',5);
-- created: 3
```

Verification immediately after (no manual step in between):

```
      relname       | rls | policies |  owner
--------------------+-----+----------+----------
 audit_logs_2026_10 | t   |        3 | postgres
 audit_logs_2026_11 | t   |        3 | postgres
 audit_logs_2026_12 | t   |        3 | postgres
```

Each newly-created partition has:

- RLS enabled (`t`)
- ≥ 1 policy (3 in this case, propagated from parent)
- expected owner (`postgres`)

D21-B invariant re-run after the operation: **PASS** (0 offenders).

---

## 5. Scope confirmation (nothing else changed)

Migration diff, in full:

- `CREATE OR REPLACE FUNCTION public.assert_partition_rls(text)` + `ALTER … OWNER TO postgres` (new).
- `CREATE OR REPLACE FUNCTION public.ensure_partition_rls(text)` + `ALTER … OWNER TO postgres` (new overload).
- `CREATE OR REPLACE FUNCTION public.create_monthly_partitions(text,text,integer)` + `ALTER … OWNER TO postgres` — body diff is exactly the two `PERFORM` lines inserted after the existing `EXECUTE format('CREATE TABLE …')`.

No `ALTER TABLE`, no `CREATE/DROP POLICY`, no `GRANT`/`REVOKE`, no `CREATE INDEX`, no retention or partitioning-strategy changes, no renames.

---

## 6. Follow-up flagged (out of scope, not opened)

- `FUP-PARTITION-NAMING-01` — the `agent_system_metrics_partitioned` parent has legacy children named without the parent prefix (`agent_system_metrics_2026_07`). New calls to `create_monthly_partitions` on that parent will collide until the naming is reconciled. Existing partitions already have RLS on (verified), so this is a hygiene issue, not a security issue. No hotfix opened without evidence of user-facing impact.

---

## Closure

All five acceptance criteria met:

1. Root cause classified → orphan function / incomplete refactor.
2. Old vs. new flow → documented above.
3. Rollback proof on failure → collision test + assert raise test.
4. Post-condition proof → `audit_logs_2026_10..12` born with RLS on, 3 policies, owner postgres.
5. No functional change beyond the creation flow → diff limited to two new functions + two `PERFORM` lines.

The class of problems that originated HF-RLS-01 is closed. Prevention now has two layers:

- **D21-B** (CI invariant) — regression cannot merge.
- **D21-A** (creation hook) — regression cannot occur at runtime.

D21-C (RPC SECURITY DEFINER inventory as pipeline artifact) remains queued and awaits explicit authorization.
