
# Phase 6D + 6F: Edge Function Consolidation Plan

## Current State: 81 functions → Target: <65

---

## Phase 6D: servePublic → public-gateway (7 inlinable, 3 must stay)

### ❌ CANNOT inline (direct URL access by agents/scripts):
1. **serve-installer** (174L + 5 helpers) — Called via direct URL `/functions/v1/serve-installer/{key}` by PowerShell one-liners on endpoints. Gateway routing breaks this.
2. **get-diagnostic-script** (347L) — Called via `irm .../get-diagnostic-script | iex` in PowerShell. Must remain direct URL.
3. **get-latest-agent-script** (191L) — Called via direct URL in agent reinstall commands. Must remain direct URL.

### ✅ CAN inline (called via `supabase.functions.invoke` or `callEdgeFunction`):

| # | Function | Lines | Helper Files | Frontend Refs | Gateway Action |
|---|----------|-------|-------------|---------------|----------------|
| 1 | validate-invite | 87 | 0 | AcceptInvite.tsx (direct fetch) | `public:validate-invite` |
| 2 | verify-document | 72 | 0 | None (external API) | `public:verify-document` |
| 3 | verify-compliance-report | 202 | 0 | useVerification.ts | `public:verify-compliance-report` |
| 4 | track-installation-event | 58 | 2 (agent-token-handler, jwt-handler) | AgentInstaller/utils.ts | `public:track-installation-event` |
| 5 | validate-hmac-signature | 87 | 0 | useAgentCredentials.ts | `public:validate-hmac-signature` |
| 6 | fido2-authenticate | 317 | 0 | FIDO2LoginButton.tsx | `public:fido2-authenticate` |
| 7 | get-reinstall-by-name | 99 | 2 (auth-resolver, script-builder) | None found | `public:get-reinstall-by-name` |

**Net reduction: -7 functions** (81 → 74)

### Implementation Steps:

#### Step 1: Create handler files in `public-gateway/handlers/`
- `validate-invite.ts` — Extract logic from standalone
- `verify-document.ts` — Extract logic from standalone  
- `verify-compliance-report.ts` — Extract logic from standalone
- `track-installation.ts` — Extract + merge helper files
- `validate-hmac.ts` — Extract logic from standalone
- `fido2-auth.ts` — Extract logic from standalone (largest, most complex)
- `reinstall-by-name.ts` — Extract + merge helper files

Each handler adapts to the `PublicHandler` signature:
```ts
(supabase, req, requestId, payload) => Promise<Response | Record<string, unknown>>
```

#### Step 2: Register in public-gateway/index.ts
Add 7 new entries to `INLINED_HANDLERS` map.

#### Step 3: Update frontend references
- `src/pages/AcceptInvite.tsx` → route through `public-gateway`
- `src/pages/VerificarLaudo/useVerification.ts` → route through `public-gateway`
- `src/pages/AgentInstaller/utils.ts` → route through `public-gateway`
- `src/pages/AgentInstaller/hooks/useAgentCredentials.ts` → route through `public-gateway`
- `src/components/auth/FIDO2LoginButton.tsx` → route through `public-gateway`

#### Step 4: Delete standalone directories (7 dirs)
#### Step 5: Undeploy from Supabase (7 functions)
#### Step 6: Deploy updated public-gateway
#### Step 7: Test via curl_edge_functions

---

## Phase 6F: agent-gateway for serveAgent functions (HIGH RISK)

### 22 serveAgent functions (1852 total lines):

| # | Function | Lines | HMAC? | Multi-file? |
|---|----------|-------|-------|-------------|
| 1 | ack-job | 103 | Yes | No |
| 2 | check-agent-updates | 46 | No | No |
| 3 | collect-router | 69 | Yes | No |
| 4 | confirm-force-update | 94 | No | No |
| 5 | diagnostics-agent-logs | 62 | No | No |
| 6 | get-agent-config | 93 | No | No |
| 7 | get-agent-policy | 78 | No | No |
| 8 | get-blocked-websites | 84 | No | No |
| 9 | list-reports | 28 | No | No |
| 10 | post-installation-telemetry | 142 | No | No |
| 11 | scan-virus | 114 | Yes | No |
| 12 | serve-agent-update | 100 | No | No |
| 13 | serve-dns-filter | 70 | Yes | No |
| 14 | submit-antivirus-status | 64 | No | No |
| 15 | submit-rollback-event | 88 | No | No |
| 16 | submit-router | 88 | Yes | No |
| 17 | submit-software-inventory | 55 | No | No |
| 18 | submit-system-metrics | 105 | No | No |
| 19 | submit-vuln-findings | 59 | No | No |
| 20 | submit-web-activity | 59 | No | No |
| 21 | update-baseline | 166 | Yes | No |
| 22 | upload-report | 85 | No | No |

### Architecture:
- New `supabase/functions/agent-gateway/index.ts`
- Performs agent auth (X-Agent-Token + optional HMAC) ONCE at gateway level
- Routes to handler based on `action` field (e.g., `agent:ack-job`)
- Each handler receives authenticated `AgentContext`

### Risk Mitigation:
- Agent endpoints are called by PowerShell/Bash agents in production
- Agents use **direct function URLs** (`/functions/v1/heartbeat`, etc.)
- Changing URLs requires agent update rollout
- **Must keep old standalone functions as thin proxies temporarily** until agents upgrade

### Implementation Steps:
1. Create `agent-gateway/index.ts` with shared auth
2. Create handler files for each function
3. Agent scripts must be updated to call `agent-gateway` with action routing
4. Keep old standalone functions as deprecation proxies (forward to gateway)
5. After agent fleet upgrades → delete proxies

**Net reduction Phase 6F: -22 functions (but +22 proxy stubs initially, so net 0 until agents upgrade)**
**This means 6F provides NO immediate function count reduction.**

---

## Recommended Execution Order:
1. **Phase 6D first** (low risk, immediate -7 reduction → 74 functions)
2. **Phase 6F deferred** — only valuable after agent fleet supports gateway routing

## Expected Final Count:
- After 6D: **74 functions**
- After 6F (eventual): **~55 functions**
