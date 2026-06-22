# S-P0.5 — Defense-in-depth DB trigger for critical job completion

**Status:** ✅ APPLIED
**Migration:** `20260622_*_enforce_critical_job_evidence` (this turn)

## Goal
Block any `UPDATE public.jobs SET status='completed'` on critical job types
unless tamper-evident proof of work exists. Complements the application-level
checks already in `ack-job` (rejects legacy ack of critical types) and
`submit-job-result` (writes side-effect rows + `JOB_INTEGRITY_OK` audit log).

## Critical job types
`security_scan`, `software_inventory`, `web_activity`, `collect_web_activity`,
`scan_vulnerabilities`. Same allow-list as `supabase/functions/ack-job/index.ts`.

## Acceptance rules (any one suffices)
1. `jobs.output->>'evidence_hash'` matches `^[0-9a-f]{64}$` (SHA-256 hex,
   produced by `ack-job` and — in a follow-up PR — by `submit-job-result`).
2. A row in `public.agent_evidence_logs` for the same `(tenant_id, agent_id)`
   carries `event_data->>'job_id' = jobs.id` and a 64-hex `evidence_hash`.
3. Side-effect rows exist in the destination table created on/after
   `jobs.created_at`:
   - `software_inventory` → `public.software_inventory.last_seen_at`
   - `web_activity` / `collect_web_activity` → `public.agent_web_activity.created_at`
     (or `jobs.error_message ILIKE '%WARNING%'` for the documented empty-coleta path)
   - `scan_vulnerabilities` / `security_scan` → `public.agent_vulnerability_scans.created_at`

When none of (1)/(2)/(3) hold, the trigger raises
`JOB_INTEGRITY_VIOLATION` (SQLSTATE `23514`).

## Compatibility
- ✅ `submit-job-result` already writes side-effect rows before updating the
  job → rule (3) covers normal flow.
- ✅ `ack-job` rejects critical types at the edge function → trigger acts as
  belt-and-braces if app check is ever bypassed (e.g. direct service-role
  update or future regression).
- ✅ Coexists with `enforce_job_side_effects` (covers `collect_system_metrics`)
  and `check_job_integrity` (pre-existing).

## Verification
```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid='public.jobs'::regclass AND tgname='trg_enforce_critical_job_evidence';
-- expected: 1 row
```

## Rollback
```sql
DROP TRIGGER IF EXISTS trg_enforce_critical_job_evidence ON public.jobs;
DROP FUNCTION IF EXISTS public.enforce_critical_job_evidence();
```

## P-P0 piggyback in same migration
- `idx_jobs_status_retry_completed` on `(status, retry_count, completed_at)
  WHERE retry_count IS NOT NULL` targets slow query #3
  (6.6k calls, avg 306 ms — `WHERE status=$1 AND retry_count<$2
  ORDER BY completed_at ASC`). Tradeoff: faster reads on that pattern, marginal
  write overhead on `jobs`.

## Follow-ups (not in this PR)
- **S-P0.5b**: extend `submit-job-result` to also stamp
  `jobs.output.evidence_hash` so rule (1) covers the happy path
  independently of side-effect tables.
- **S-P0.4**: 66 pre-existing `SECURITY DEFINER` linter warnings (anon/auth
  execute) — separate inventory + revocation PR.
