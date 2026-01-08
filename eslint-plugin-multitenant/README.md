# eslint-plugin-multitenant

ESLint plugin to enforce multi-tenant isolation patterns for Supabase queries.

## Overview

This plugin implements ADR-026 (Active Tenant Isolation) by ensuring all queries to multi-tenant tables use the `tenantQuery()` helper or include explicit `tenant_id` filtering.

## Rules

### `multitenant/no-supabase-query-without-tenant`

Detects direct `supabase.from()` calls to multi-tenant tables that don't include tenant filtering.

**❌ Incorrect:**
```typescript
// Missing tenant filter - BLOCKED
const { data } = await supabase
  .from('agents')
  .select('*');
```

**✅ Correct:**
```typescript
// Using tenantQuery helper - ALLOWED
const { data } = await tenantQuery('agents', tenant.id)
  .select('*');

// Or explicit tenant_id filter - ALLOWED
const { data } = await supabase
  .from('agents')
  .select('*')
  .eq('tenant_id', tenant.id);
```

## Multi-Tenant Tables

The following tables require tenant isolation:

- `agents`
- `tasks`
- `system_alerts`
- `jobs`
- `ai_insights`
- `agent_web_activity`
- `agent_system_metrics`
- `agent_disk_metrics`
- `agent_network_info`
- `agent_builds`
- `agent_evidence_logs`
- `enrollment_keys`
- `security_policies`
- `governance_reports`
- `playbook_executions`
- `scheduled_jobs`
- `vuln_findings`
- `software_inventory`
- `user_roles`
- `tenant_features`
- `tenant_action_policies`
- `blocked_websites`

## Installation

```bash
npm install --save-dev eslint-plugin-multitenant
```

## Configuration

Add to your ESLint config:

```javascript
// eslint.config.js
import multitenantPlugin from 'eslint-plugin-multitenant';

export default [
  {
    plugins: {
      multitenant: multitenantPlugin,
    },
    rules: {
      'multitenant/no-supabase-query-without-tenant': 'error',
    },
  },
];
```

Or use the recommended config:

```javascript
import multitenantPlugin from 'eslint-plugin-multitenant';

export default [
  multitenantPlugin.configs.recommended,
];
```

## Related

- [ADR-026: Active Tenant Isolation](../docs/architecture/ADR-026-active-tenant-isolation.md)
- [tenantQuery helper](../src/lib/tenantQuery.ts)
