

## Investigation Results

**Root Cause**: Both agents are running **OLD scripts from disk**. All hotfixes (pipeline-safe, typesafe-status, registered_at, ProtectedProcessSet) are correctly applied in the database, but agents don't re-download on restart — they keep executing the stale `.ps1` file.

**Evidence from DB query**: `has_pipeline_safe: true`, `has_typesafe_status: true`, `has_init_protectedset: true`, `has_trycatch: true` — but `has_registered_at_fix: false` (fix IS present in DB, just missing the marker string).

**Evidence from logs**: pcteste1's latest runs (15:54-16:00) no longer show `script_sha256` or `ProtectedProcessSet` errors (those were from Feb 27), but STILL show `registered_at` error and 404 on sync — confirming OLD script on disk.

## Errors and Fixes

| Error | Agent | Root Cause | Fix |
|-------|-------|-----------|-----|
| FATAL `.status` line 4854 | MIT-SERVIDOR | Old script, pipeline pollution | Force re-download |
| `registered_at` property not found | Both | Old script doesn't have Add-Member fix | Force re-download |
| 404 on SYNCING | Both | `serve-dns-filter` not deployed | Deploy function |
| `script_sha256` not found | pcteste1 | Heartbeat standard response lacks this field | Add to response |
| Force update won't trigger | Both | Heartbeat compares `force_update_version !== agent_version`, both are v5.0.13 | Fix comparison logic |

## Implementation Plan

### Step 1: Fix heartbeat to include `script_sha256` in standard response
Add `script_sha256: null` to the standard heartbeat response (line 361-367 of `agent-heartbeat/index.ts`) so old agents don't crash trying to access this property.

### Step 2: Fix force_update logic to support same-version pushes
Currently `agent.force_update_version !== agent.agent_version` blocks same-version re-pushes. Change to check `force_update_at` being set (not null) as the trigger, regardless of version match. This allows pushing the fixed v5.0.13 script without a version bump.

### Step 3: SQL migration — trigger force_update on both agents
Set `force_update_version = 'v5.0.13'`, `force_update_at = now()`, `force_update_reason = 'Critical hotfix: pipeline-safe + registered_at + ProtectedProcessSet'` on MIT-SERVIDOR and pcteste1. On next heartbeat, agents will receive the fixed script.

### Step 4: Add registered_at HOTFIX marker to DB script
Update `agent_releases` to include `HOTFIX-SAFE-REGISTERED-AT` comment in the DB script for consistency with other hotfix markers, preventing HOTFIX 12 from attempting to re-apply.

### Step 5: Deploy edge functions
Deploy `agent-heartbeat` and `serve-dns-filter`.

