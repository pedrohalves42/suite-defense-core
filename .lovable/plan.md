

# Phase 1: Edge Function Middleware Migration — Batch 1

## Summary

156 functions still use raw `Deno.serve()`. After excluding 22 HMAC functions and 57 already-hardened `assertInternalCaller` functions, approximately **77 functions** remain as migration targets. Of those, ~70 are already on middleware, leaving **~77 unmigrated non-HMAC, non-internal functions**.

These break into 4 sub-categories requiring different treatment:

## Classification of Unmigrated Functions

### Category A: JWT-authenticated admin/UI → `serveTenant` (~65 functions)

Functions that manually do `getUser()` + role check + tenant lookup. Classic `serveTenant` candidates.

Examples: `revoke-enrollment-key`, `rollback-by-decision-event`, `send-notification`, `list-invoices`, `change-password`, `admin-create-user`, `delete-invite`, `quarantine-agent`, `auto-quarantine`, `block-website`, `generate-compliance-report`, `generate-executive-report`, `cohort-analysis`, `fido2-authenticate`, `verify-compliance-report`, `customer-portal`, `list-reports`, `diagnose-agent`, `export-evidence-bundle`, `send-security-notification`, `notification-dispatcher`, `approve-via-token`, etc.

### Category B: Cross-tenant super_admin → `serveTenant` with `skipTenantValidation` (~8 functions)

Functions that require `super_admin` and access data across tenants. Use `serveTenant` with `skipTenantValidation: true` (pattern already used by `list-all-users-admin`).

Examples: `revenue-projections`, `sales-pipeline`, `cohort-analysis`, `unit-economics`, `subscription-analytics`, `create-custom-trial`

### Category C: API-key authenticated → keep `Deno.serve()` (3 functions)

`api-tenant-info`, `api-tenant-stats`, `api-tenant-features` use `authenticateApiKey()` (not JWT). These use a completely different auth model. **Do not migrate** — they already have Zod validation, rate limiting, and structured logging.

### Category D: Special raw-body requirements → keep `Deno.serve()` (2 functions)

`stripe-webhook` (needs raw body for Stripe signature verification) and `post-installation-telemetry` (HMAC). Cannot migrate.

## Implementation Plan — Batch 1 (20 highest-priority functions)

We'll migrate 20 functions per batch, starting with mutation endpoints that handle sensitive operations.

### For each function, the migration is mechanical:

1. Replace `Deno.serve(async (req) => {` with `serveTenant(async (req, ctx) => {`
2. Remove manual CORS handling, Supabase client creation, JWT validation, tenant lookup
3. Use `ctx.supabase`, `ctx.userId`, `ctx.tenantId`, `ctx.requestId`, `ctx.body`
4. Add Zod schema for input validation where missing
5. Add `{ methods: ['POST'], skipTenantValidation: true/false }` options as needed

### Batch 1 Priority List (20 functions)

| # | Function | Lines | Auth Pattern | Target |
|---|----------|-------|-------------|--------|
| 1 | `revoke-enrollment-key` | 164 | JWT+role | `serveTenant` |
| 2 | `rollback-by-decision-event` | 198 | JWT+role | `serveTenant` |
| 3 | `auto-quarantine` | ~150 | JWT+role | `serveTenant` |
| 4 | `block-website` | ~120 | JWT+role | `serveTenant` |
| 5 | `quarantine-agent` | ~140 | JWT+role | `serveTenant` |
| 6 | `verify-compliance-report` | ~160 | JWT | `serveTenant` |
| 7 | `generate-compliance-report` | ~200 | JWT+role | `serveTenant` |
| 8 | `generate-executive-report` | ~180 | JWT+role | `serveTenant` |
| 9 | `fido2-authenticate` | ~150 | JWT | `serveTenant` |
| 10 | `send-notification` | ~130 | JWT | `serveTenant` |
| 11 | `list-invoices` | ~100 | JWT | `serveTenant` |
| 12 | `check-agent-name-availability` | ~80 | JWT | `serveTenant` |
| 13 | `diagnose-agent` | ~150 | JWT | `serveTenant` |
| 14 | `customer-portal` | ~100 | JWT | `serveTenant` |
| 15 | `change-password` | ~120 | JWT | `serveTenant` |
| 16 | `revenue-projections` | 202 | JWT+super_admin | `serveTenant` skip |
| 17 | `sales-pipeline` | 194 | JWT+super_admin | `serveTenant` skip |
| 18 | `cohort-analysis` | ~180 | JWT+super_admin | `serveTenant` skip |
| 19 | `unit-economics` | ~160 | JWT+super_admin | `serveTenant` skip |
| 20 | `subscription-analytics` | ~150 | JWT+super_admin | `serveTenant` skip |

### Migration Template

```text
BEFORE (revoke-enrollment-key pattern):
─────────────────────────────────────
import { createClient } from '...supabase-js@2.74.0';
const corsHeaders = { ... };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return ...
  const authHeader = req.headers.get('Authorization');
  const userClient = createClient(URL, ANON, { headers: { Authorization } });
  const { data: { user } } = await userClient.auth.getUser();
  const supabase = createClient(URL, SERVICE_KEY);
  const { keyId } = await req.json();
  // ... business logic ...
});

AFTER:
─────
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const RevokeKeySchema = z.object({
  keyId: z.string().uuid(),
});

serveTenant(async (req, ctx) => {
  const { supabase, userId, tenantId, requestId, body } = ctx;
  const parsed = RevokeKeySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  // ... business logic using ctx ...
}, { methods: ['POST'] });
```

### What NOT to change

- **22 HMAC functions** — stay on `Deno.serve()` (Track B: add Zod only, separate batch)
- **57 `assertInternalCaller` functions** — already hardened, keep as-is
- **3 API-key functions** (`api-tenant-*`) — different auth model, keep as-is
- **`stripe-webhook`** — needs raw body for Stripe signature
- **70 already-migrated functions** — no changes needed

### Estimated effort

~20 functions × ~15 min each = ~5 hours of mechanical migration. Each function follows the same pattern: strip boilerplate, add Zod schema, wire to middleware.

### Risk mitigation

- Each function is independently deployable
- The middleware is battle-tested across 70+ functions already
- No changes to the middleware itself
- Functions that return plain objects get auto-wrapped in JSON response by the middleware

