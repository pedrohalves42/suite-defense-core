# Bloco D8-C — confirm-force-update typed

## Scope
- File: `supabase/functions/confirm-force-update/index.ts`
- Goal: remove `@ts-nocheck`, add real typing, no runtime change.

## Changes
- Removed `@ts-nocheck`.
- Imported `SupabaseClient` and `Database` types; narrowed `ctx.supabase` to `SupabaseClient<Database>` inside handler (public `AgentContext` left untouched).
- Added `asNullableString` / `asNumber` helpers to narrow `agentData: Record<string, unknown>` fields safely.
- Replaced blind casts (`as string | null`, `as number`) on `agent_version`, `force_update_version`, `force_update_delivery_count`, `force_update_delivered_count`.
- `body` remains `unknown` (from `AgentContext.body`), validated via `ConfirmForceUpdateSchema.safeParse` before use.

## Preserved (runtime untouched)
- Optional HMAC verification (best-effort, token-only fallback for pre-hotfix agents).
- Idempotency branch (already-confirmed).
- Mismatch branch (409 with same payload shape).
- Staged branch (202 with same payload shape and `force_update_staged` evidence row).
- Final clear-update branch: same fields cleared on `agents`, same `force_update_applied` evidence row (same `event_data` keys — no fields added or removed).
- All status codes, messages, headers (`Content-Type: application/json`).
- `extraAgentFields` list unchanged.
- No new logs containing secrets / token / signature / hmac_secret.

## Out of scope (not touched)
- `serve-agent-update`, `register-agent-key`, `serve-agent.ts`, `agent-auth.ts`.
- HMAC verification logic, replay window, rate limit.
- RLS, migrations, RPCs, storage, jobs/remediation.

## Gates
- `bunx tsgo --noEmit` — ✅ 0 errors
- `bun run lint` — ✅ 0 errors (pre-existing warnings only)
- `bash scripts/bloco-c-gates.sh` — ✅ PASS (3/3)
- `bash ci/security_gate.sh` — ⏳ requires `DATABASE_URL`, delegated to CI

## Smoke (logical)
| Case | Expected | Status |
|---|---|---|
| valid confirmation | clears force_update + applied evidence | preserved |
| invalid agent / tenant | blocked by serveAgent middleware | preserved |
| invalid version (mismatch) | 409 with same shape | preserved |
| malformed payload | 400 from Zod | preserved |
| HMAC invalid / replay | warn-only (token-only fallback) | preserved |
| duplicate confirmation | idempotent return | preserved |
| logs | structured, no secrets | preserved |

## Verdict
D8-C closed. Agent identity/update chain (D8-A + D8-B + D8-C) now fully typed.
