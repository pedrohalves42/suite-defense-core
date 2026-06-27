# D14-A2 — Auth / Identity cleanup (result)

Scope: Tier A — auth/identity edge surface. Type-only sanitation, zero runtime change.

## Files cleaned (`@ts-nocheck` removed)

| # | File | Sub-onda |
|---|------|----------|
| 1 | `supabase/functions/api-gateway/handlers/admin-auth.ts` | A2.1 |
| 2 | `supabase/functions/api-gateway/handlers/enrollment.ts` | A2.2 |
| 3 | `supabase/functions/auto-generate-enrollment/index.ts`   | A2.2 |
| 4 | `supabase/functions/enroll-agent/index.ts`               | A2.2 |
| 5 | `supabase/functions/fido2-register/index.ts`             | A2.3 |

## Type-only patches required

1. **`enroll-agent/index.ts`** & **`enroll-agent/key-validator.ts`**
   - Local widening of `createAuditLog` signature: `userId` made optional via aliased import + cast.
   - Reason: pre-auth enrollment paths legitimately have no user. Runtime always passed `undefined`; audit row is persisted identically.
   - `key-validator.ts` was pulled into the type graph once `index.ts` lost `@ts-nocheck`; same fix applied for consistency. No `@ts-nocheck` to remove there.

2. **`fido2-register/index.ts`**
   - Cast `body` (typed `unknown` by `serveTenant`) to a narrow shape used only for action routing; Zod still validates each branch.
   - Cast `public_key` payload from `Uint8Array` to the bytea-as-string PostgREST type. Bytes sent over the wire are unchanged.

No changes to: HMAC paths, challenge/response, FIDO2 cryptography, rate limiting, IP blocklist, audit content, RPC arguments, HTTP status codes, error messages, response shapes.

## Validation

```
deno check api-gateway/handlers/admin-auth.ts   → PASS
deno check api-gateway/handlers/enrollment.ts   → PASS
deno check auto-generate-enrollment/index.ts    → PASS
deno check enroll-agent/index.ts                → PASS  (key-validator.ts in graph: PASS)
deno check fido2-register/index.ts              → PASS
```

Gate CI (`scripts/guard-no-ts-nocheck-tier1.sh`): **PASS** — protected list expanded from 39 → **45** files (5 D14-A2 + `enroll-agent/key-validator.ts` defensively pinned).

## Metrics

| Metric                                  | Before D14-A2 | After D14-A2 |
|-----------------------------------------|---------------|--------------|
| Active `@ts-nocheck` in `supabase/functions` | 93           | **88**        |
| Files protected by Tier 1 gate          | 39            | **45**        |
| `_shared/` directives                    | 0             | 0            |

## Consumers verified

- `api-gateway/index.ts` — no new errors introduced by D14-A2 (3 pre-existing unrelated errors remain: missing `honeypot.ts` module, `handleRevenueProjectionsV2`, `SB` — tracked separately, untouched).
- `auto-generate-enrollment/agent-manager.ts`, `key-generator.ts` — unaffected.
- `enroll-agent/key-validator.ts`, `agent-handler.ts` — clean.

## Follow-ups (not opened in this block)

- **API-GATEWAY-DRIFT-01** — pre-existing errors in `api-gateway/index.ts`: missing `honeypot.ts` import, undeclared `handleRevenueProjectionsV2`, stray `SB` reference.
- **AUDIT-CONTRACT-01** — `createAuditLog` signature requires `userId: string` but several pre-auth paths legitimately pass none. Candidate to widen the official contract in `_shared/audit.ts` (currently mitigated via per-call cast).
- **FIDO2-PUBKEY-TYPE-01** — `fido2_credentials.public_key` typed as `string` but runtime sends `Uint8Array` (bytea). Candidate for proper Database type override.
- **FIDO2-BODY-TYPE-01** — `serveTenant` exposes `body: unknown`; consider a generic on the helper so consumers don't need local casts.

## Status

**D14-A2 closed.** Auth/identity Tier A surface is type-clean and locked by gate. Ready for the next D14 sub-wave when authorized.
