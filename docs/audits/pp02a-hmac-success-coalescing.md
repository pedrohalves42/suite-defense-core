# P-P0.2-A — HMAC success-path coalescer (LRU + batch)

**Status:** ✅ Shipped (default OFF — enable via feature flag `hmac_success_coalescing`)
**Scope:** First implementation slice of `pp02-telemetry-batching-proposal.md`.

## What ships

A new module `supabase/functions/_shared/hmac-success-coalescer.ts` and a
guarded callsite inside `_shared/hmac.ts` that turns the per-success
`agent_hmac_format_cache` upsert into:

1. an **in-memory LRU** keyed by `agent_id` with a TTL of 30 s — repeat
   verifies of the same agent within the TTL skip the write entirely;
2. a **batched upsert** flushing every 50 rows **or** 1.5 s (whichever
   first), deduplicated inside the batch by `agent_id`;
3. a **per-row fallback** if the batched upsert returns an error — the
   format cache must keep being refreshed (warm fast-path matters for
   p95 verify latency).

## What is explicitly out of scope

- HMAC algorithm — untouched (`computeHmacHex`, key derivation, payload
  variants, timing-safe compare are all unchanged).
- Agent wire contract — untouched (no header, encoding or payload changes).
- Replay protection — untouched. `hmac_check_and_record` RPC continues to
  be the atomic source of truth for nonce uniqueness. The coalescer
  never touches `hmac_signatures`.
- Failure / replay / invalid paths — untouched. `logAuthFailure` and the
  `AUTH_REPLAY_DETECTED` / `AUTH_INVALID_SIGNATURE` / `AUTH_TIMESTAMP_OUT_OF_RANGE`
  branches still write immediately.

## Feature flag

| key | scope | default | behaviour |
|---|---|---|---|
| `hmac_success_coalescing` | global (tenant_id NULL) | `false` | When `false` (or unreadable): inline upsert, same as pre-PP02-A. When `true`: enqueue into coalescer. |

The flag is read via `isFeatureEnabled(..., { defaultOnError: false })`
and cached for 30 s per edge instance — outages of `feature_flags` cannot
silently flip the path on.

Seeded as `false` in `public.feature_flags` (`(tenant_id, key) = (NULL, 'hmac_success_coalescing')`).

## Metrics (in-memory, logged on every flush)

`getCoalescerMetrics()` returns counters:

| counter | meaning |
|---|---|
| `lru_hits` | dedup wins (the row was skipped because the same agent was upserted recently) |
| `buffered` | rows added to the pending batch |
| `flush_batches` | successful batch flushes |
| `flushed_rows` | rows persisted via batch |
| `flush_errors` | batched upsert failures (triggers fallback) |
| `fallback_rows` | per-row upserts that succeeded after a batch failure |
| `fallback_errors` | per-row upserts that also failed |
| `bypass_disabled` | inline upserts taken because the feature flag is off |

Counters are logged via `logger.info('[hmac-coalescer] flushed', { metrics })`
so they surface in edge function logs and can be plotted from the
`edge_function_metrics` view if desired later.

## Validation

- Smoke test: `supabase/functions/_shared/__tests__/hmac-success-coalescer.test.ts`
  (4/4 passing) — covers LRU dedupe within TTL, batch dedupe + single
  write, batch-error fallback, and inline bypass.
- Type-check: the new module passes `deno check`. Two existing TS errors
  in `hmac.ts` (`crypto.subtle.digest` BufferSource strictness, re-export
  of `timingSafeEqual`) pre-date this change and are unaffected.
- The pre-existing `heartbeat/__tests__/hmac-validator.test.ts` cannot
  currently be executed (it imports `heartbeat/auth/hmac-validator.ts`
  which is missing) — that is a separate, pre-existing bug unrelated to
  PP02-A; the HMAC verification path used by the heartbeat function
  (`_shared/hmac.ts → verifyHmacSignature`) is the same path covered by
  the contract tests under `contracts/`.

## Canary rollout — 2026-06-22

The generic `is_feature_enabled` RPC treats a global `enabled=false` row as a
kill switch (deny for every tenant), so a tenant-row override is impossible
through that RPC. Because the coalescer is a non-security side-effect
optimisation, the gating in `_shared/hmac.ts` was switched to a tiny
canary-aware reader that queries `feature_flags` directly:

| precedence | source | behaviour |
|---|---|---|
| 1 | row `(tenant_id = X, key = 'hmac_success_coalescing')` | uses `enabled` for tenant X |
| 2 | row `(tenant_id IS NULL, key = ...)` | uses `enabled` globally |
| 3 | no row / DB error | `false` (fail-closed, inline upsert) |

Result cached 30 s per `tenantId` per edge instance.

### Active canary

- **Tenant:** `Genial Cred` (`2584d2cd-8b99-4ca7-a8e2-b61256e82b3e`) —
  internal tenant with live agent traffic.
- **Global row:** `enabled=false` (unchanged) — every other tenant keeps the
  inline path.
- **Window:** 30–60 min from migration timestamp.

### What to watch (30–60 min)

In edge function logs (`_shared/hmac.ts` callsites — `heartbeat`,
`poll-jobs`, `submit-job-result`, `ack-job`, etc.):

- `[hmac-coalescer] flushed` events with `metrics.lru_hits > 0`,
  `flush_batches > 0`, `flush_errors = 0`, `fallback_errors = 0`.
- `metrics.bypass_disabled` should drop for traffic from the canary tenant
  (its requests now take the coalescer path) and stay high for other tenants.

In `agent_hmac_format_cache`: visible reduction of repeat upserts for the
canary tenant's agents (rows for a given `agent_id` get touched in batches
rather than once per request).

In `heartbeat` / auth signals:
- heartbeat success rate stable, no new 401/403 spike,
- no new `AUTH_INVALID_SIGNATURE` / `AUTH_REPLAY_DETECTED` logs above the
  pre-canary baseline.

### Go / no-go criteria

Advance (consider widening) only if all are true:
- `flush_errors == 0`
- `fallback_errors == 0`
- heartbeat stable for the canary tenant
- no increase in 401/403
- `lru_hits > 0` and the format-cache upsert volume for the canary tenant
  measurably decreased

### Rollback

1. **Instant (canary off, no migration):**
   ```sql
   UPDATE public.feature_flags
   SET enabled = false, updated_at = now()
   WHERE tenant_id = '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e'
     AND key = 'hmac_success_coalescing';
   ```
   Within ≤ 30 s every edge instance re-reads the row for that tenant and
   reverts to the inline upsert. No data migration, no agent restart.

2. **Full kill (all tenants):** keep the global row at `enabled=false`
   (already the case) and set the canary tenant row to `false` per (1).

3. **Hard rollback (revert code):** the only callsite is `_shared/hmac.ts`
   around `onMatch`. Revert that block to the previous `updateCache`
   fire-and-forget closure and delete `hmac-success-coalescer.ts` + its
   test. The feature flag rows can be left in place (harmless).


## Expected impact

Conservative target from the proposal: ~80 min/window of DB CPU saved
across the `hmac_signatures` family. The format-cache upsert is one of
the components in that family; the rest (the nonce INSERT and the
pre-check SELECT) require the separate, larger change (replay LRU + DB
unique index) that we deferred from PP02-A by user constraint.

## Status of sibling work

- **S-P0.5 / S-P0.5b — CLOSED.** Trigger `trg_enforce_critical_job_evidence`
  is installed and enabled (`pg_trigger.tgenabled = 'O'`). The happy path
  in `submit-job-result/index.ts` unconditionally stamps
  `output.evidence_hash` (lines 130–155) for every completion, satisfying
  trigger rule (1) independently of side-effect tables.
