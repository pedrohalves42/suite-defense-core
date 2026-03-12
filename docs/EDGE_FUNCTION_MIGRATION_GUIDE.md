# Edge Functions Migration Guide — serveTenant() Middleware

## Overview

The `serveTenant()` middleware centralizes tenant validation for all Edge Functions, eliminating boilerplate and ensuring consistent security enforcement.

**Location:** `supabase/functions/_shared/serve-tenant.ts`

## Three Middleware Types

| Middleware | Auth | Tenant Validation | Use Case |
|---|---|---|---|
| `serveTenant()` | JWT / service_role / X-Internal-Secret | ✅ Automatic | User-facing & internal functions |
| `serveAgent()` | X-Agent-Token | ✅ From agent's tenant | Agent-facing endpoints |
| `servePublic()` | None | ❌ | Webhooks, health checks |

## Migration Pattern

### Before (manual boilerplate):
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const authHeader = req.headers.get('Authorization');
  // ... 30+ lines of auth boilerplate ...
  // ... tenant lookup ...
  // ... validation ...
  
  // Actual business logic starts here
});
```

### After (with serveTenant):
```typescript
import { serveTenant } from '../_shared/serve-tenant.ts';

serveTenant(async (_req, ctx) => {
  // ctx.tenantId — guaranteed valid
  // ctx.userId — set for user calls
  // ctx.supabase — service_role client
  // ctx.body — parsed request body
  
  const { data } = await ctx.supabase
    .from('my_table')
    .select('*')
    .eq('tenant_id', ctx.tenantId);
    
  return { data };
});
```

## Function Categories & Migration Priority

### 🔴 CRITICAL — User-facing, accepts tenant_id, NO validation (~50 functions)
These must be migrated first:

#### AI/Insights
- ai-get-insights ← already has manual validation (optimize)
- ai-analyze-agent
- ai-behavioral-anomaly-detector
- ai-correlate-alerts
- ai-execute-solution
- ai-full-audit
- ai-insight-dispatcher
- ai-predict-agent-failure
- ai-quality-check
- ai-red-team-assessment
- ai-security-copilot
- ai-system-analyzer
- ai-system-audit
- auto-triage-insights
- auto-execute-ai-actions
- ai-action-executor
- ai-agent-assist

#### Jobs/Actions
- create-job ← already has manual validation (optimize)
- action-center-feed
- evaluate-automation-rules
- evaluate-playbook-triggers
- execute-playbook
- execute-playbook-action
- process-playbook-trigger-logs

#### Security/Compliance
- send-security-alert ✅ MIGRATED
- run-attack-simulation ✅ MIGRATED
- generate-compliance-report ← already has manual validation
- generate-security-report
- generate-executive-report
- generate-explainable-report
- calculate-compliance
- calculate-risk-score
- scan-vulnerabilities
- scan-virus
- check-credential-leaks

#### Admin/Management
- admin-create-user ← already has manual validation
- list-users
- list-all-users-admin
- update-member-role
- update-user-role
- update-user-status
- remove-member
- send-invite
- accept-invite
- delete-invite

#### Agent Management
- build-agent-exe
- diagnose-agent
- quarantine-agent
- auto-quarantine
- auto-remediate
- apply-security-patch
- force-reinstall-fleet

### 🟡 MEDIUM — Already have some validation, need optimization
- generate-enrollment-key
- revoke-enrollment-key
- block-website
- get-blocked-websites
- get-software-inventory
- get-web-activity
- siem-export
- export-evidence-bundle

### 🟢 LOW — Agent-authenticated (use serveAgent)
- heartbeat
- agent-heartbeat
- poll-jobs
- ack-job
- submit-job-result
- submit-antivirus-status
- submit-processes
- submit-system-metrics
- submit-software-inventory
- submit-web-activity
- submit-network-info
- submit-vuln-findings
- submit-agent-evidence
- submit-data-exposure
- submit-ransomware-indicator
- submit-process-lineage
- submit-rollback-event
- submit-backup-status
- enroll-agent

### ⚪ SAFE — Public/webhook/cron (use servePublic or skip)
- stripe-webhook
- build-callback
- health
- submit-contact
- heartbeat-self-test
- All cleanup-* cron jobs
- All check-* cron jobs
- All monitor-* cron jobs

## Estimated Migration Effort

| Category | Count | Time per fn | Total |
|---|---|---|---|
| 🔴 Critical (no validation) | ~50 | 5 min | ~4 hours |
| 🟡 Medium (has partial) | ~15 | 3 min | ~45 min |
| 🟢 Agent (serveAgent) | ~20 | 5 min | ~1.5 hours |
| ⚪ Safe (skip/servePublic) | ~30+ | 2 min | ~1 hour |

**Total: ~7 hours of batch migration for 90%+ coverage**

## Coverage After Full Migration

| Layer | Before | After |
|---|---|---|
| Frontend | ~98% | ~99.9% |
| Edge Functions | ~5% | ~95% |
| Database/RLS | ~90% | ~90% |
| **Overall** | **~65%** | **~95%** |
