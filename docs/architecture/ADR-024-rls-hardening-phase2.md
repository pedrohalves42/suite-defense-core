# ADR-024: RLS Hardening Phase 2-7 - Complete Security Remediation

## Status
**Accepted** - 2026-01-14 (Updated)

## Context

During comprehensive security scan, we identified multiple security issues requiring multi-phase remediation:
- 16 tables with overly permissive SELECT policies (Phase 2)
- 19 views exposing data without proper tenant isolation (Phase 3)
- 1 critical view (`active_agents`) exposing `hmac_secret` without any filtering (Phase 4)
- Multiple dependent views requiring CASCADE recreation (Phase 4)
- `agent_releases` table with overly permissive policies (Phase 5)
- 8 views with `security_invoker=true` but missing tenant filtering (Phase 6)
- Core safe views needing tenant filtering and HMAC secret protection (Phase 7)

## Phase 2: Table RLS Policies

### Tables with Hardened SELECT Policies

| Table | Previous Access | New Access |
|-------|-----------------|------------|
| `software_vulnerability_baseline` | all authenticated | admin/super_admin only |
| `cve_database` | all authenticated | admin/super_admin only |
| `software_knowledge_base` | all authenticated | admin/super_admin only |
| `agent_releases` | public | active only to auth, all to admin |
| `agent_versions` | all authenticated | admin/super_admin only |
| `system_state` | all authenticated | super_admin only |
| `system_liveness` | all authenticated | admin/super_admin only |
| `system_health_checks` | all authenticated | admin/super_admin only |
| `runbooks` | all authenticated | admin/operator/super_admin |
| `security_definer_allowlist` | all authenticated | super_admin only |
| `feature_flags` | all authenticated | admin/super_admin only |

## Phase 3: View Security (security_invoker + Tenant Filtering)

### Views Secured with Proper Tenant Isolation

All views now use `WITH (security_invoker = true)` and include tenant filtering:

| View | Protection Added |
|------|------------------|
| `hmac_agent_secrets` | super_admin-only access (HMAC secrets) |
| `job_failure_health` | tenant filtering |
| `circuit_breaker_health` | tenant filtering |
| `dlq_categorized` | security_invoker + tenant |
| `agents_safe` | security_invoker + tenant |
| `agent_timeline_events` | security_invoker + tenant |
| `installation_error_summary` | security_invoker + super_admin |
| `agents_health_view` | security_invoker + tenant |
| `enrollment_keys_safe` | security_invoker + tenant |
| `rate_limit_stats` | security_invoker + admin only |
| `agent_system_metrics_unified` | security_invoker + tenant |
| `audit_logs_safe` | security_invoker + tenant |
| `invites_safe` | security_invoker + tenant |
| `governance_health_metrics` | security_invoker + tenant |
| `job_integrity_violations` | security_invoker + tenant |
| `insight_feedback_quality` | security_invoker + tenant |
| `jobs_normalized` | security_invoker + super_admin |
| `agent_installation_metrics` | security_invoker + super_admin |
| `agent_releases_public` | security_invoker + auth check |

## Phase 4: Critical Views with Dependencies

### CRITICAL FIX: `active_agents` View

The `active_agents` view was exposing `hmac_secret` without any filtering!

**Changes:**
- REMOVED `hmac_secret` column from view
- Added tenant filtering via `user_roles`
- Added `is_current_super_admin()` fallback
- Recreated dependent views with CASCADE

### Dependent Views Recreated

| View | Changes |
|------|---------|
| `v_tenant_plan_status` | Added security_invoker + tenant filter |
| `v_system_operations_summary` | Added security_invoker + tenant filter |
| `v_action_center` | Added security_invoker + tenant filter |

## Phase 5: Agent Releases Table

Tightened RLS on `agent_releases`:
- Active releases: visible to all authenticated users
- Inactive releases: visible to admin/super_admin only
- Manage operations: super_admin only

## Phase 6: Views with security_invoker But Missing Tenant Filter

Several views had `security_invoker=true` but lacked proper tenant filtering, meaning they could still expose data across tenants.

### Views Corrected

| View | Change Applied |
|------|----------------|
| `v_agent_lifecycle_state` | Added tenant filter via `user_roles` subquery |
| `v_ai_anomalies` | Added tenant filter via `user_roles` subquery |
| `v_audit_moving_average` | Added tenant filter via `user_roles` subquery |
| `v_cron_silent_failures` | Added tenant filter via `scheduled_jobs.tenant_id` |
| `v_edge_function_stats` | Added tenant filter + grouped by `tenant_id` |
| `v_enforcement_compliance` | Added tenant filter via `security_policies.tenant_id` |
| `v_execution_chain_health` | Added tenant filter via `agents.tenant_id` |
| `v_task_stats` | Added tenant filter via `user_roles` subquery |

### Intentionally Public View

| View | Justification |
|------|---------------|
| `v_system_contracts` | Static enum reference table with no tenant-specific data |

## Phase 7: Core Safe Views with Tenant Filtering

Recreated all core "_safe" and "_public" views with proper security:

### Views Fixed

| View | Changes |
|------|---------|
| `hmac_agent_secrets` | super_admin only (HMAC secrets are highly sensitive) |
| `agents_public` | Excludes hmac_secret, tenant-filtered |
| `agents_safe` | Excludes hmac_secret, tenant-filtered |
| `active_agents` | Excludes hmac_secret, active only, tenant-filtered |
| `enrollment_keys_safe` | Excludes key/token, tenant-filtered |
| `invites_safe` | Excludes token, tenant-filtered |
| `audit_logs_safe` | Excludes internal hash fields, tenant-filtered |

## Implementation

All policies use the existing `public.has_role()` and `public.is_current_super_admin()` SECURITY DEFINER functions to avoid RLS recursion.

All views use `WITH (security_invoker = true)` which executes queries with caller's permissions.

Standard tenant filter pattern:
```sql
WHERE (
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
)
```

## Remaining Warnings

3 remaining Supabase linter warnings are for `service_role` policies with `USING(true)`:
- These are **expected and safe** per ADR-023
- Used for Edge Functions to insert system data
- Service role credentials never exposed to clients

## Consequences

### Positive
- `hmac_secret` is now properly protected (removed from all public views)
- All views have tenant isolation
- security_invoker prevents privilege escalation
- Follows principle of least privilege
- Views with `security_invoker` now properly filter by tenant

### Negative
- Frontend components may need updates for new access restrictions
- Minor performance impact from additional auth checks

## Migration Files
- `20260113_rls_hardening_phase2.sql` (Phase 2)
- `20260113_rls_hardening_phase3.sql` (Phase 3)
- `20260113_rls_hardening_phase4.sql` (Phase 4)
- `20260113_rls_hardening_phase5.sql` (Phase 5)
- `20260114_rls_hardening_phase6.sql` (Phase 6)
- `20260114_rls_hardening_phase7.sql` (Phase 7 - Safe views)

## Related
- [ADR-023: RLS Hardening](./ADR-023-rls-hardening.md)
- [SECURITY_ARCHITECTURE.md](../SECURITY_ARCHITECTURE.md)
