# ADR-024: RLS Hardening Phase 2 & 3 - Complete Security Remediation

## Status
**Accepted** - 2026-01-13

## Context

During comprehensive security scan, we identified multiple security issues:
- 16 tables with overly permissive SELECT policies (Phase 2)
- 19 views exposing data without proper tenant isolation (Phase 3)
- 1 critical view (`hmac_agent_secrets`) with NO security controls

## Phase 2: Table RLS Policies

### Tables with Hardened SELECT Policies

| Table | Previous Access | New Access |
|-------|-----------------|------------|
| `software_vulnerability_baseline` | all authenticated | admin/super_admin only |
| `cve_database` | all authenticated | admin/super_admin only |
| `software_knowledge_base` | all authenticated | admin/super_admin only |
| `agent_releases` | public | authenticated (is_active only) |
| `agent_versions` | all authenticated | admin/super_admin only |
| `system_state` | all authenticated | super_admin only |
| `system_liveness` | all authenticated | admin/super_admin only |
| `system_health_checks` | all authenticated | admin/super_admin only |
| `runbooks` | all authenticated | admin/operator/super_admin |
| `security_definer_allowlist` | all authenticated | super_admin only |
| `feature_flags` | all authenticated | admin/super_admin only |

### Tables Not Found (Skipped)
- `compliance_frameworks`
- `compliance_controls`
- `cve_keyword_cache`
- `ai_insight_patterns`
- `api_rate_limits`

## Phase 3: View Security (security_invoker + Tenant Filtering)

### Views Secured with Proper Tenant Isolation

| View | Issue Fixed |
|------|-------------|
| `hmac_agent_secrets` | **CRITICAL**: Added admin-only access + tenant filtering |
| `job_failure_health` | Added tenant filtering |
| `circuit_breaker_health` | Added tenant filtering |
| `dlq_categorized` | Added security_invoker |
| `agents_safe` | Added security_invoker |
| `agent_timeline_events` | Added security_invoker |
| `installation_error_summary` | Added super_admin fallback |
| `agents_health_view` | Added security_invoker |
| `enrollment_keys_safe` | Added super_admin fallback |
| `rate_limit_stats` | Added security_invoker |
| `agent_system_metrics_unified` | Added security_invoker |
| `audit_logs_safe` | Added super_admin fallback |
| `invites_safe` | Added security_invoker |
| `governance_health_metrics` | Added security_invoker |
| `job_integrity_violations` | Added security_invoker |
| `insight_feedback_quality` | Added security_invoker |
| `jobs_normalized` | Added super_admin fallback |
| `agent_installation_metrics` | Added super_admin fallback |
| `agent_releases_public` | Added security_invoker |

### Table RLS Policy Added
| Table | Policy Added |
|-------|--------------|
| `agent_web_activity` | tenant_web_activity_select (tenant isolation) |

## Implementation

All policies use the existing `public.has_role()` and `public.is_current_super_admin()` SECURITY DEFINER functions to avoid RLS recursion.

All views now use `WITH (security_invoker = true)` to execute with caller's permissions.

## Consequences

### Positive
- All views now have proper tenant isolation
- HMAC secrets are protected (admin-only)
- security_invoker prevents privilege escalation
- Follows principle of least privilege

### Negative
- Frontend components may need updates for new access restrictions

### Remaining Linter Warnings
3 remaining warnings are for `service_role` policies with `USING(true)` - expected and safe per ADR-023.

## Migration Files
- `20260113_rls_hardening_phase2.sql` (Phase 2)
- `20260113_rls_hardening_phase3.sql` (Phase 3)

## Related
- [ADR-023: RLS Hardening](./ADR-023-rls-hardening.md)
- [SECURITY_ARCHITECTURE.md](../SECURITY_ARCHITECTURE.md)
