

## Plan: Critical Security & Performance Hardening (Audit Response)

Addressing the 6 highest-impact findings from the repository audit, ordered by severity.

---

### 1. 🔴 CRITICAL — Eliminate Unverified Telemetry Persistence

**File**: `supabase/functions/post-installation-telemetry/index.ts`

**Problem**: When auth fails (missing token, invalid token, inactive token, expired token, HMAC failure), the function persists data into `installation_analytics` as "unverified" — same table as verified data. This contaminates SOC metrics and enables data poisoning.

**Fix**:
- Remove the `recordUnverifiedTelemetry()` function entirely
- Replace all 4 fallback paths (lines 117-193) with proper 401/403 error responses that **reject** the request
- For HMAC failures on otherwise-authenticated agents (lines 207-212): reject with 401 instead of recording unverified
- Log the rejection attempts for forensics but **never persist** unverified data

**Result**: Zero unverified data enters `installation_analytics`. Agents must authenticate or get rejected.

---

### 2. 🟠 HIGH — Add `expires_at` Validation to `authenticateAgent()`

**File**: `supabase/functions/_shared/agent-auth.ts`

**Problem**: The shared middleware checks `is_active` but not `expires_at`. All `serveAgent()` endpoints inherit this gap — expired tokens are accepted.

**Fix**:
- Add `expires_at` to the select query (line 50)
- After the token lookup succeeds, check `expires_at`:
  ```
  if (token.expires_at && new Date(token.expires_at) < new Date()) {
    return { success: false, response: 401 "Token expired" };
  }
  ```
- This fix propagates automatically to all `serveAgent()` endpoints

---

### 3. 🟡 MEDIUM — Return Proper HTTP Error Codes from `validate-hmac-signature`

**File**: `supabase/functions/validate-hmac-signature/index.ts`

**Problem**: Returns HTTP 200 for validation failures and unexpected errors. Clients checking only status codes see "success" on failures.

**Fix**:
- Invalid payload → **400** (not 200)
- HEX conversion failed → **422** (not 200)
- Unexpected error → **500** (not 200)
- Only successful validation returns 200

---

### 4. 🟡 MEDIUM — Server-Side Vulnerability Count Aggregation

**File**: `src/hooks/useUnifiedMetrics.ts` (line 123-125)

**Problem**: `select('severity')` fetches ALL vuln_findings rows to count in browser memory. With 10K+ vulns this wastes bandwidth and CPU.

**Fix**: Replace the raw select with a count query:
```typescript
// Before:
sb.from('vuln_findings').select('severity').eq('tenant_id', tenant.id)

// After (two parallel head-count queries):
sb.from('vuln_findings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
sb.from('vuln_findings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).in('severity', ['critical', 'high']),
```

Zero rows transferred, counts come from headers. Lines 143, 197-199 updated accordingly.

---

### 5. 🟡 MEDIUM — Restrict CORS on Telemetry Endpoint

**File**: `supabase/functions/post-installation-telemetry/index.ts` (line 8)

**Problem**: `Access-Control-Allow-Origin: '*'` on a sensitive telemetry endpoint allows browser-based abuse from any origin.

**Fix**: Since this endpoint is called by PowerShell agents (not browsers), remove CORS entirely or restrict to the app domain:
```typescript
"Access-Control-Allow-Origin": Deno.env.get('ALLOWED_ORIGIN') || "https://cybershield-audit.lovable.app"
```

---

### 6. ⚪ LOW — Security Gate Hard-Fail When DATABASE_URL Missing

**File**: `.github/workflows/security-gate.yml` (lines 32-36)

**Problem**: When `DATABASE_URL` is absent, the gate exits 0 (success) — giving false confidence in forks/new repos.

**Fix**: Exit with a warning code (exit 78 = neutral in GitHub Actions) and add a clear step summary indicating the gate was **skipped**, not passed.

---

### Summary of Changes

| File | Change | Severity |
|------|--------|----------|
| `post-installation-telemetry/index.ts` | Remove unverified fallback, reject unauthenticated requests | 🔴 Critical |
| `_shared/agent-auth.ts` | Add `expires_at` check | 🟠 High |
| `validate-hmac-signature/index.ts` | Return 400/422/500 instead of 200 | 🟡 Medium |
| `useUnifiedMetrics.ts` | Server-side count aggregation | 🟡 Medium |
| `post-installation-telemetry/index.ts` | Restrict CORS origin | 🟡 Medium |
| `security-gate.yml` | Hard-fail on missing DATABASE_URL | ⚪ Low |

**6 files modified. No new tables or migrations needed.**

