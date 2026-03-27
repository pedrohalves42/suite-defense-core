

# Plan: Migrate Heartbeat to serveAgent, Decompose submit-job-result, Fix SECURITY DEFINER

## Context

Three critical refactors remain from the audit. Each requires careful, surgical work to preserve existing business logic.

## 1. Migrate `heartbeat` to `serveAgent` (805 lines)

### Problem
`heartbeat` uses raw `Deno.serve()` with manual token auth (lines 32-76) that duplicates what `serveAgent` already provides. However, heartbeat needs **extra agent fields** not returned by `serveAgent`'s `authenticateAgent()` — specifically `status`, `skip_firewall_remediation`, `agent_version`, and all `force_update_*` fields (lines 62-95).

### Approach
**Cannot use `serveAgent` as-is.** The `AuthenticatedAgent` interface only returns `{ id, agent_name, tenant_id, hmac_secret }`. Heartbeat needs 12+ additional agent fields for force-update logic. Two options:

**Option A (chosen): Extend `serveAgent` context** — Add an `options.extraAgentFields` parameter to `serveAgent` that enriches the agent query with additional columns. This keeps backward compatibility while allowing heartbeat to request the fields it needs.

**Option B (alternative): Use `serveAgent` + re-query** — Accept the minimal agent context from `serveAgent`, then do a second query for the extra fields. This adds latency to a hot path.

### Changes

**File: `supabase/functions/_shared/agent-auth.ts`**
- Add optional `selectFields` parameter to `authenticateAgent()` that appends extra columns to the `agents!inner(...)` select
- Default remains `id, agent_name, tenant_id, hmac_secret`
- Return extra fields as `agentData: Record<string, unknown>` in the result

**File: `supabase/functions/_shared/serve-tenant.ts`**
- Add `extraAgentFields?: string[]` to a new `ServeAgentOptions` parameter on `serveAgent()`
- Pass through to `authenticateAgent()`
- Extend `AgentContext` with `agentData: Record<string, unknown>`

**File: `supabase/functions/heartbeat/index.ts`**
- Replace `Deno.serve()` with `serveAgent()`, passing `extraAgentFields` for force-update fields
- Remove lines 1-76 (manual auth boilerplate) — replaced by middleware
- Remove manual `createClient()` — use `ctx.supabase`
- Remove manual CORS/OPTIONS handling — handled by middleware
- **Preserve all business logic intact**: HMAC version gating (V-702), rate limiting, force-update delivery, script hotfix, self-heal hash, parallel ops
- The HMAC verification block (lines 106-170) stays because heartbeat has custom legacy/modern agent version gating that goes beyond the standard HMAC check
- Body parsing moves to `ctx.body` (serveAgent already parses JSON, including gzip)

### Risk: Medium
- Must preserve the expanded agent_tokens join (line 62-69) which fetches force_update fields
- Must verify that `serveAgent`'s body parsing doesn't conflict with HMAC's `rawBody` requirement

---

## 2. Decompose `submit-job-result` into modules (1,893 lines)

### Problem
Single monolithic function handling: auth, validation, HMAC, rate limiting, payload parsing, execution_id normalization, job ownership verification, cross-tenant checks, payload tamper detection, duplicate submission, side-effect processing for **8 different job types** (software inventory, web activity, antivirus, network info, certificates, disk metrics, DNS blocks, blocked websites), job update with integrity triggers, audit trail, report triggering, and more.

### Approach
Extract into logical modules **within the same function directory** (Edge Functions support local imports from sibling files). Keep `index.ts` as the orchestrator.

### New files in `supabase/functions/submit-job-result/`:

**`types.ts`** — Interfaces for agent, job, payload, side-effect context

**`validation.ts`** — Payload schema validation (job_id, status, execution_id normalization, execution_time validation, V-203 transition date check)

**`security.ts`** — Job ownership check, cross-tenant check, payload tamper detection, duplicate submission check, logSecurityEvent calls

**`side-effects/software-inventory.ts`** — Lines 582-637 (software_inventory_collect processing)

**`side-effects/web-activity.ts`** — Lines 640-793 (collect_web_activity processing, domain map, batch insert)

**`side-effects/antivirus.ts`** — Lines 796-857 (collect_antivirus_status processing, WMI state decode)

**`side-effects/network-info.ts`** — Lines 860-947 (collect_network_info processing, IP classification)

**`side-effects/certificates.ts`** — Lines 950-1001 (collect_certificates processing)

**`side-effects/disk-metrics.ts`** — Lines 1003-1056 (collect_disk_metrics processing)

**`side-effects/index.ts`** — Router that dispatches to the correct handler based on `job.type`

**`execution.ts`** — Lines 1059-1307 (execution finalization, output hash, signature verification, retroactive execution creation)

**`post-completion.ts`** — Lines 1309-1877 (governance validation, update_agent version check, report trigger, blocked access analysis, DNS block events)

**`index.ts`** (rewritten as orchestrator) — ~100 lines: auth → validate → security checks → side effects → execution → job update → post-completion

### Risk: Medium
- Many side-effect handlers share the `sideEffectsInserted` and `insertedRecordsCount` state — need a shared accumulator object passed through
- The ZERO TRUST pattern (side effects BEFORE job update) must be preserved exactly
- Domain matching logic is duplicated between web-activity and post-completion blocked analysis — can be extracted to a shared `domain-matcher.ts`

---

## 3. Fix remaining SECURITY DEFINER without search_path

### Problem
A previous migration (20260111) fixed 9 functions. But the codebase has grown since then. Need to find and fix any remaining functions.

### Approach
Create a migration that queries `pg_proc` for SECURITY DEFINER functions in the `public` schema that don't have `search_path` set, and applies `SET search_path = public` to each.

### Migration SQL
```sql
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, 
           pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_options_to_table(p.proconfig) 
        WHERE option_name = 'search_path'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      r.nspname, r.proname, r.args
    );
    RAISE NOTICE 'Fixed: %.%(%)', r.nspname, r.proname, r.args;
  END LOOP;
END $$;
```

### Risk: Low
- Only targets `public` schema functions (never touches reserved schemas)
- `ALTER FUNCTION ... SET search_path` is non-destructive
- Idempotent — safe to run multiple times

---

## Execution Order

| Step | Task | Files Changed | Risk |
|------|------|---------------|------|
| 1 | SECURITY DEFINER migration | 1 migration file | Low |
| 2 | Extend `serveAgent` with `extraAgentFields` | `agent-auth.ts`, `serve-tenant.ts` | Low |
| 3 | Migrate heartbeat to `serveAgent` | `heartbeat/index.ts` | Medium |
| 4 | Create submit-job-result modules | 10+ new files, rewrite `index.ts` | Medium |

Steps 1-2 are independent and safe. Step 3 depends on step 2. Step 4 is independent of steps 2-3.

## Constraints

- No changes to `serveTenant`/`servePublic`/`serveAgent` function signatures — backward compatibility per memory policy
- All business logic preserved exactly — per migration safety policy
- No mass sed/grep — manual file-by-file per safety policy
- `heartbeat` HMAC version gating (V-702) must remain even after `serveAgent` migration

