# P-P0.2 — Telemetry write coalescing / batching proposal

**Status:** 📋 PROPOSAL (no code change in this round)
**Source data:** `supabase--slow_queries` snapshot taken right after S-P0.5/P-P0.1.

## TL;DR
The slowest queries in the cluster are no longer index-fixable reads; they are
high-volume single-row INSERTs/UPDATEs originating from the agent telemetry
pipeline. The next perf win comes from collapsing those write storms at the
edge (HTTP boundary) and at the agent (batch window), not from new indexes.

## The hot writers

| # | Statement (normalized) | Calls | Mean ms | Total min | Notes |
|---|---|---:|---:|---:|---|
| 1 | `INSERT INTO agent_evidence_logs (...) RETURNING id` | 147,981 | 27.84 | 68.7 | One row per evidence event |
| 2 | `INSERT INTO hmac_signatures (agent_name, signature)` | 663,610 | 4.49 | 49.7 | Per-request nonce write |
| 3 | `UPDATE agents SET last_heartbeat = $1 WHERE id = $2` | 194,451 | 7.02 | 22.8 | Heartbeat refresh |
| 4 | `UPDATE agents SET agent_version,..., last_heartbeat WHERE id = $2` | 263,141 | 5.12 | 22.5 | Full heartbeat |
| 5 | `UPDATE agents SET last_heartbeat WHERE agent_name = $2` | 380,284 | 2.83 | 17.9 | Legacy heartbeat path |
| 6 | `INSERT INTO hmac_signatures` (alt path) | 206,887 | 5.18 | 17.9 | Same table, different caller |
| 7 | `INSERT INTO agent_system_metrics (...)` | 47,870 | 19.28 | 15.4 | Per-cycle metrics |
| 8 | `SELECT id FROM hmac_signatures WHERE signature=$1 ORDER BY used_at DESC` | 686,791 | 1.08 | 12.3 | Dedupe lookup before insert |
| 9 | `INSERT INTO agent_disk_metrics (...)` (multi-row) | 55,966 | 14.00 | 13.1 | Already batched per agent |
| 10 | `INSERT INTO rate_limits ... ON CONFLICT DO UPDATE` | 777,800 | 0.92 | 11.9 | Upsert hot path |

Together items 1-7 account for ≈ **215 minutes of DB CPU** in the snapshot
window. Most are amplification from agents polling/heartbeating, not from
end-user traffic.

## Proposed coalescing per stream

### A. `hmac_signatures` (items 2, 6, 8) — **highest ROI**
- **Current**: every agent request does (a) SELECT to check replay, (b) INSERT
  the new signature. ≈ 870k SELECT+INSERT pairs per snapshot.
- **Proposal**:
  1. Move replay detection to an in-memory LRU per edge instance keyed by
     `(agent_id, signature)` with TTL = nonce window (e.g. 5 min). Skip the
     SELECT when the LRU answers.
  2. Buffer INSERTs in an Edge-side queue and flush every N rows or T ms via
     `supabase.from('hmac_signatures').insert(batch)`.
  3. Add a partial unique index `(agent_id, signature)` per partition to keep
     the replay invariant enforced at the DB level (defense in depth).
- **Expected impact**: kill 80-90 % of items 2/6/8. ≈ **80 min/window** saved.
- **Risk**: replay window shortens to the LRU TTL across edge instances;
  acceptable because the DB unique index still rejects true replays.

### B. `agents.last_heartbeat` (items 3, 4, 5)
- **Current**: every heartbeat issues a single-row UPDATE; three different
  shapes (id-only, full payload, agent_name fallback).
- **Proposal**:
  1. Edge-side coalescer: buffer heartbeats per `agent_id` for up to 5 s and
     keep only the latest. Flush in one `upsert()` batch.
  2. Deprecate the legacy `WHERE agent_name = $2` path (item 5) — duplicate
     write surface; redirect to id path.
  3. Move the "full heartbeat" (item 4) to a `RETURNING last_heartbeat` no-op
     update only when fields actually changed (current code always writes
     all 8 columns).
- **Expected impact**: ≈ 60 % reduction across items 3-5. ≈ **35 min/window**.
- **Risk**: heartbeat freshness drops from real-time to ≤ 5 s. Already within
  existing `staleTime` budgets in `agents_health_view`.

### C. `agent_evidence_logs` (item 1)
- **Current**: each business event writes its own row.
- **Proposal**:
  1. Batch insert at the edge: group events from a single agent request into
     one `insert(batch)` call (most submit handlers already produce 2-5
     evidence rows per call).
  2. For `severity = 'info'` evidence (the bulk of volume — `submit-job-result`
     audit trail), allow async fire-and-forget via `EdgeRuntime.waitUntil()`
     so the client response is not blocked.
- **Expected impact**: 30-40 % reduction in row count, larger reduction in
  per-request latency tail (`max_ms = 4493`). ≈ **20 min/window**.
- **Risk**: tiny window of evidence loss on edge instance crash; mitigated by
  keeping the synchronous insert for `severity = 'critical'` and for the
  `ack-job` evidence written by S-P0.5/S-P0.5b (which the DB trigger depends
  on).

### D. `agent_system_metrics` (item 7)
- **Current**: agent posts one metrics row per cycle.
- **Proposal**: have the agent buffer 3-5 cycles and post a single
  `insert(batch)`; partition writer already handles it. Reduce cycle latency
  cost ≈ 5×.
- **Expected impact**: ≈ **10 min/window**.

### E. `rate_limits` upsert (item 10)
- **Current**: 777k upserts/window. Already cheap (mean 0.92 ms) but the
  sheer volume taxes WAL.
- **Proposal**: route through Redis/KV (the `kv_cache` table exists) for the
  hot endpoints; only persist the rolling window summary to `rate_limits`
  every N seconds.
- **Expected impact**: low % per call, large reduction in WAL pressure.
- **Risk**: bucketing accuracy drops in failover; document trade-off.

## Sequencing recommendation
1. **PR 1** — `hmac_signatures` LRU + batched insert (highest ROI, isolated).
2. **PR 2** — heartbeat coalescer + retire `agent_name` UPDATE path.
3. **PR 3** — `agent_evidence_logs` batching guarded by severity, keeping
   S-P0.5 evidence path synchronous.
4. **PR 4** — agent-side metrics batch window.
5. **PR 5** — `rate_limits` → KV.

Each PR ships behind a feature flag (`tenant_features` or `feature_flags`
table already present) and a rollback note in `docs/audits/`.

## Out of scope
- New tables / schema changes.
- Replacing PostgREST with custom RPCs.
- Touching the existing partitioning strategy.

## Success metrics
- Per-stream `total_ms` reduction ≥ projection above, measured by
  `supabase--slow_queries` 7 days after rollout.
- p95 edge latency for `heartbeat` and `submit-job-result` reduced ≥ 20 %.
- No regression in `JOB_INTEGRITY_OK` audit volume.
