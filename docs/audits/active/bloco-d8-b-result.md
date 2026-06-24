# D8-B — serve-agent-update/index.ts

## Status
✅ `@ts-nocheck` removed
✅ tsgo --noEmit: 0 errors
✅ bun run lint: 0 errors
✅ bloco-c-gates: PASS (3/3)
⏳ ci/security_gate.sh: requires DATABASE_URL (CI)

## Changes
- Removed `@ts-nocheck` from `supabase/functions/serve-agent-update/index.ts`
- `ctx.supabase` narrowed to `SupabaseClient<Database>` in handler scope (public `AgentContext.supabase` remains `any` for back-compat)
- `release` typed via `.single<ReleasePick>()` where `ReleasePick = Pick<Database['public']['Tables']['agent_releases']['Row'], 'id'|'version'|'script_content'|'sha256'|'release_notes'|'created_at'|'signature_base64'|'signed_at'|'signed_by'>`
- `agentData.*` reads go through `asNullableString(unknown)` (replaces `as string | null` casts)
- `rolloutPercentage` derived via `typeof === 'number'` narrowing on `rolloutPolicy.rollout_percentage`, with same `100` fallback as before
- `hmacSecret || ''` → `hmacSecret ?? ''` (semantics preserved; `hmac_secret` is `string | null`)
- Removed unused imports: `normalizeForWindows`, `buildCorsHeaders` (already removed from this file's flow; CORS handled by middleware)

## Preserved (no runtime change)
- Response shape: `version`, `script_content`, `sha256`, `script_sha256`, `script_content_base64`, `sha256_base64`, `signature_base64`, `signed_at`, `signed_by`, `expected_sha256`, `signature_timestamp`, `release_notes`, `platform`, `current_version`, `legacy_agent_detected`, `self_healing_note`, `confirm_url`, `confirm_method`, `confirm_body_schema`, `confirm_required_headers`, `confirm_instructions`
- Force-update priority via `handleForceUpdate` (untouched)
- Rollout bucket calculation + `checkRolloutPolicy` blocking
- Legacy version list (`3.10.37`, `3.10.39`, `3.10.14`) and `updateDecisionService.evaluate` flow
- `prepareScriptForDelivery` pipeline (decode → hotfix → reject HTML → normalize → SHA-256 → base64)
- `resignIfNeeded` re-sign + conditional persist on `contentChanged && resigned`
- Best-effort HMAC verification (non-blocking) — same accept/log behavior
- `extraAgentFields: ['agent_version','os_type','force_update_version','force_update_reason']`
- No new hardcoded paths/URLs/versions; `SUPABASE_URL` from env; `confirm_url` built from env
- No secrets in logs

## Out of scope (not touched)
- `confirm-force-update`, `register-agent-key`, `force-update-handler.ts`, `rollout-engine.ts`, `script-delivery.ts`, `agent-script-preparation.ts`, `script-resigner.ts`
- `agent_releases` schema, RLS, RPC, migrations, storage/bucket
- HMAC/auth/replay logic
- Manifest/release/checksum/signature validation rules

## Next
D8-C — `confirm-force-update/index.ts`
