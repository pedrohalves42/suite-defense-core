# ADR-037: Security Views & RLS Policy Review

## Status
**Accepted** - 2026-02-20

## Context

Phase 3 security review identified pre-existing issues requiring documentation and targeted fixes:

1. `ai_response_cache` had an ALL policy for `public` role — critical vulnerability
2. `agents_safe` view used `security_invoker=off` without `security_barrier`
3. Several reference tables had `SELECT USING(true)` without tenant isolation

## Decision

### 1. Fixed: `ai_response_cache` Public Access

| Before | After |
|--------|-------|
| ALL for `public` with USING(true) | ALL restricted to `service_role` |
| No tenant isolation on reads | SELECT for `authenticated` with tenant_id filter |

### 2. Hardened: `agents_safe` View

| Property | Value | Justification |
|----------|-------|---------------|
| `security_invoker` | `off` | Intentional — dashboard requires definer context for tenant metadata |
| `security_barrier` | `true` | **Added** — prevents query optimization leaks |
| Tenant isolation | `get_active_tenant_id()` filter in WHERE | Internal enforcement |

### 3. Hardened: Reference Table Policies

Tables with tenant_id now use tenant-scoped policies instead of `USING(true)`:
- `failure_fingerprints` → tenant_id filter
- `incident_slo_state` → tenant_id filter

### 4. Intentionally Permissive SELECT Policies (Documented)

These tables contain global reference data with no tenant-specific content:

| Table | Justification |
|-------|---------------|
| `subscription_plans` | Public pricing info (documented in ADR-023) |
| `software_knowledge_base` | Global software catalog |
| `software_vulnerability_baseline` | Global CVE baseline |
| `system_global_state` | System-wide operational state |
| `system_health_checks` | Global health status |
| `system_liveness` | Liveness probe data |
| `system_state` | System configuration |
| `security_definer_allowlist` | Allowlist for definer functions |

## Consequences

### Positive
- Eliminates public role access to AI cache
- Prevents query optimization data leaks on `agents_safe`
- Adds tenant isolation to 2 previously unscoped tables

### Neutral  
- Linter still reports `agents_safe` as security definer view — intentional and documented
- `service_role` policies with `USING(true)` remain — safe per ADR-023

## Related
- [ADR-023: RLS Hardening](./ADR-023-rls-hardening.md)
- [RLS Policies Audit](../rls-policies-audit.md)
- DATA-AGENT-001: active_agents usage policy
