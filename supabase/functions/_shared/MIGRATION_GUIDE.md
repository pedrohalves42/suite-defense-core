# Edge Function Middleware Migration Guide

## Classification

| Middleware | Use Case | Auth Method |
|-----------|----------|-------------|
| `serveTenant` | UI-facing, JWT auth, tenant isolation | JWT + user_roles |
| `serveAgent` | Agent-facing, token auth (with optional HMAC) | X-Agent-Token |
| `servePublic` | Public endpoints, no auth | Rate limiting only |
| `serveInternal` | Cron/internal, service_role | X-Internal-Secret |

## Migration Status (Phase 2 Complete)

### ✅ Migrated to `serveAgent` (Phase 1 — 14 functions)
ack-job, check-agent-updates, confirm-force-update, get-blocked-websites, list-reports,
scan-virus, serve-agent-update, serve-dns-filter, submit-antivirus-status,
submit-rollback-event, submit-software-inventory, submit-system-metrics,
submit-vuln-findings, submit-web-activity, upload-report, update-baseline.

### ✅ Migrated to `serveInternal` (Phase 2)
analyze-network-anomalies, auto-generate-report, autonomous-safe-mode,
check-agent-integrity, check-pending-agents, check-production-health,
cleanup-stale-reports, cleanup-stale-updates, cleanup-stuck-jobs,
cleanup-telemetry, compute-compliance-benchmarks, generate-executive-report,
process-scheduled-jobs, scheduled-compliance-refresh, sync-stripe-subscriptions.

### ✅ Migrated to `servePublic` (Phase 2)
api-tenant-features, get-latest-agent-script, get-reinstall-preserve-script,
log-domain-event, verify-compliance-report.

### ✅ Migrated to `serveTenant` (Phase 2)
accept-invite, create-stripe-products, revenue-projections, token-rotate,
update-member-role.

### ⚠️ Keep Raw `Deno.serve()` — Special Cases

Functions that remain on raw `Deno.serve()` due to complex auth flows,
raw body requirements (HMAC before JSON parse), or orchestration complexity:

| Function | Reason |
|----------|--------|
| `heartbeat` | HMAC raw body verification + complex state machine |
| `poll-jobs` | HMAC raw body + job claiming pipeline |
| `enroll-agent` | Enrollment key auth (not token/JWT) |
| `register-agent-key` | HMAC raw body verification |
| `stripe-webhook` | Stripe signature verification on raw body |
| `saml-sso` | SAML auth flow (redirects, XML parsing) |
| `scim-provisioning` | SCIM bearer token auth + multi-method routing |
| `soar-engine` | Complex orchestration router |
| `cleanup-router` | Internal action router (proxied by cleanup-*) |
| `ops-router` | Internal operations router |
| `serve-installer` | Public file serving with streaming |
| `get-reinstall-by-name` | Agent token + custom script generation |
| `recover-agent-credentials` | Enrollment key auth recovery flow |
| `evaluate-automation-rules` | Complex hybrid auth (service_role + JWT + per-tenant) |
| `evaluate-playbook-triggers` | Hybrid auth (internal + admin JWT) |
| `promote-agent-v5` | Internal OR super_admin dual auth |
| `auto-generate-enrollment` | Complex auth + IP blocklist + APM wrapping |
| `register-agent-release` | Super_admin + supply chain validation |
| `oncall-integration` | Multi-action router without tenant isolation |

## serveTenant Migration

### Before
```typescript
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseKey);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = await req.json();
  // ... business logic ...
});
```

### After
```typescript
import { serveTenant } from '../_shared/serve-tenant.ts';

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;
  // ... business logic only ...
});
```

## serveAgent Migration

### Before
```typescript
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const token = req.headers.get('X-Agent-Token');
  // ... manual token lookup ...
  const body = await req.json();
  // ... logic ...
});
```

### After
```typescript
import { serveAgent } from '../_shared/serve-tenant.ts';

serveAgent(async (req, ctx) => {
  const { supabase, agentId, tenantId, requestId, body } = ctx;
  // ... logic ...
}, {
  hmacVerify: true,  // Optional: enable HMAC signature verification
  rateLimit: { endpoint: 'my-endpoint', maxRequests: 60, windowMinutes: 1 },
});
```

## serveInternal Migration

```typescript
import { serveInternal } from '../_shared/serve-tenant.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;
  // ... logic ...
});
```

## servePublic Migration

```typescript
import { servePublic } from '../_shared/serve-tenant.ts';

servePublic(async (req, ctx) => {
  const { supabase, requestId, body } = ctx;
  // ... logic ...
});
```

## What the middleware handles automatically
- CORS (OPTIONS preflight)
- Supabase client creation with service_role
- JWT validation and user extraction (serveTenant)
- Agent token authentication + optional HMAC (serveAgent)
- Internal caller validation via service_role/X-Internal-Secret (serveInternal)
- Request ID generation and tracing
- Body parsing (including gzip decompression for agents)
- Error handling with structured responses
- Security headers (HSTS, CSP, X-Frame-Options)
- Optional rate limiting (serveAgent, serveTenant)
