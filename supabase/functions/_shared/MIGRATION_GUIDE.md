# Edge Function Middleware Migration Guide

## Classification

| Middleware | Use Case | Auth Method |
|-----------|----------|-------------|
| `serveTenant` | UI-facing, JWT auth, tenant isolation | JWT + user_roles |
| `serveAgent` | Agent-facing, token auth (NO raw body HMAC) | X-Agent-Token |
| `servePublic` | Public endpoints, no auth | Rate limiting only |
| `assertInternalCaller` | Cron/internal, service_role | X-Internal-Secret |

## ⚠️ HMAC Functions — DO NOT Migrate

Functions that call `verifyHmacSignature()` **before** parsing JSON body MUST stay on raw `Deno.serve()`. The HMAC verification reads the raw body text for signature computation. If `serveAgent` parses the body first, HMAC verification breaks.

**Affected:** heartbeat, poll-jobs, submit-job-result, check-agent-updates, serve-agent-update, register-agent-key, confirm-force-update, submit-system-metrics, submit-antivirus-status, submit-software-inventory, submit-web-activity, submit-network-info, enroll-agent.

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

## serveAgent Migration (token-only, no HMAC)

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
- Agent token authentication (serveAgent)
- Request ID generation and tracing
- Body parsing (including gzip decompression for agents)
- Error handling with structured responses
- Security headers (HSTS, CSP, X-Frame-Options)
