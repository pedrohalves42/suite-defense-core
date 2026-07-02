# D21-C — RPC Governance Inventory · **Baseline v1**

> **Status:** Frozen baseline. Any future snapshot is diffed against this file.
> The next workflow run must reproduce these totals (modulo real DB drift).

## Provenance

- **Collected at:** `2026-07-02 13:20:00Z` (via `supabase--read_query` from the sandbox)
- **Commit SHA:** `a183c687975f7e1a548d957e18aa4f0b5440da90`
- **Migration head:** `20260701202145_658758a3-ab66-45ba-9d9e-2cc20c06abf2.sql` (D21-A partition RLS atomicity)
- **Total SECURITY DEFINER functions in `public`:** **439**
- **Generator:** `tools/reports/generate_rpc_governance_inventory.py`
- **Query:** `tools/reports/rpc_governance_inventory.sql`

## Summary

| Status | Count |
|--------|-------|
| RISK   | **6** |
| WATCH  | 0     |
| OK     | 104   |
| INFO   | 329   |

> **RISK = 6** — the gate is doing its job on the very first run.
> Per the D21-C contract, CI **would fail** with this baseline.
> No remediation is included in D21-C's authorized scope — each RISK item
> requires its own authorized block before any grant is touched.

## RISK (6)

| # | RPC | Grants (execute) | Tenant guard | source_hash | Consumers detected |
|---|-----|------------------|--------------|-------------|--------------------|
| 1 | `assert_partition_rls(p_partition_name text)` | `PUBLIC, anon, authenticated, postgres, service_role, sandbox_exec*` | none | `804f458b0d9e05e4abd8c865fa201785` | 0 (called only from `create_monthly_partitions` server-side) |
| 2 | `ensure_partition_rls(p_partition_name text)` | `PUBLIC, anon, authenticated, postgres, service_role, sandbox_exec*` | none | `a51a5d33d66797fefd7c0cf3af9d2411` | 0 (called only from `create_monthly_partitions` server-side) |
| 3 | `check_blast_radius(p_tenant_id uuid, p_action_type text, p_affected_count integer, p_severity text)` | `anon, authenticated, postgres, service_role, sandbox_exec*` | none | `14b06b427777c0661b0a3776e25faefb` | `src/hooks/useBlastRadius.tsx`, `supabase/functions/ops-*/handlers/playbook-automation.ts`, `auto-remediate/index.ts` |
| 4 | `check_tenant_suspension(p_tenant_id uuid)` | `PUBLIC, authenticated, postgres, service_role, sandbox_exec*` | none | `62a8575a2aac18bc72b4f0a3d9e7f98e` | `supabase/functions/api-gateway/handlers/admin-auth.ts`, `src/components/auth/useLoginFlow.ts` |
| 5 | `enforce_critical_job_evidence()` | `PUBLIC, anon, authenticated, postgres, service_role, sandbox_exec*` | none | `0ca6fb31c399c93d6a55deb361890e5c` | 0 (trigger function; not called directly) |
| 6 | `has_role(_user_id uuid, _role text, _tenant_id uuid)` | `PUBLIC, anon, authenticated, postgres, service_role, sandbox_exec*` | none | `3822e8e8524ef314445afe82f589b566` | Used by RLS policies and `supabase/functions/api-gateway/handlers/admin.ts` |

Notes on the RISK set (factual, not remediation):

- **Items 1 and 2** are the helpers introduced in **D21-A**. They were created
  without an explicit `REVOKE EXECUTE FROM PUBLIC`, and Postgres's default for
  new functions is `GRANT EXECUTE TO PUBLIC`. The gate correctly flagged them.
  This is exactly the class of drift D21-C exists to catch — including drift
  we ourselves introduce.
- **Item 3** is `check_blast_radius`, i.e. the D21-D candidate. The baseline
  now provides a hard, dated data point for that discussion, without opening
  the investigation.
- **Item 4** (`check_tenant_suspension`) accepts a tenant id argument and has
  no `_assert_caller_tenant` in its body — grant/scope decision belongs to a
  separate block.
- **Item 5** is a trigger function; the wide grant is inert as long as it is
  only invoked by triggers, but the gate does not know that. Whether to
  narrow the grant or explicitly allowlist it is a governance call.
- **Item 6** is `has_role`. It is expected to be callable from RLS contexts;
  narrowing its grant needs a policy-level review first.

`sandbox_exec*` above collapses `sandbox_exec` and
`sandbox_exec_iavbnmduxpxhwubqrzzn`, which are internal Lovable Cloud roles
present on every function and carry no external exposure.

## WATCH (0)

None in this snapshot.

## OK (104)

104 RPCs are `authenticated`/`service_role`-scoped **and** carry a tenant
guard (`_assert_caller_tenant`, `get_active_tenant_id`, or `auth.uid`). Full
list is in the CSV artifact.

## INFO (329)

329 RPCs are internal helpers (postgres/service_role-only, trigger bodies,
or otherwise not on the public surface). Full list is in the CSV artifact.

## Reproduction

```bash
export PGCONN='postgres://…'   # SUPABASE_DB_URL in CI
python3 tools/reports/generate_rpc_governance_inventory.py \
  > docs/audits/active/d21-c-rpc-governance-inventory.md
# CSV is written alongside at d21-c-rpc-governance-inventory.csv
```

The workflow `.github/workflows/rpc-governance-inventory.yml` performs the
same steps on every PR touching the relevant surface, on push to `main`,
and weekly on Mondays 04:17 UTC. It uploads both files as the
`rpc-governance-inventory` artifact (90-day retention) and fails the job
when the RISK section is non-empty.

## D21-C closure state

Per the authorization ("congelar esse resultado como baseline; se ocorrer
sem RISK, considero o D21-C encerrado"):

- ✅ Query executes.
- ✅ CSV + Markdown produced.
- ✅ All 439 RPCs classified without error.
- ✅ Provenance recorded (date, commit SHA, migration head, source hashes).
- ❌ Baseline is **not** RISK-free (RISK = 6).

**D21-C therefore remains "Implemented, awaiting operational validation"**
until the RISK set is either brought to zero (via authorized follow-up
blocks) or an explicit, revisable allowlist is agreed. No such changes are
included in this delivery — the mechanism is behaving correctly and the
finding is the mechanism's first real output.
