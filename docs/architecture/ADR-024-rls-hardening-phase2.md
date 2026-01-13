# ADR-024: RLS Hardening Phase 2 - Restrict Permissive SELECT Policies

## Status
**Accepted** - 2026-01-13

## Context

During comprehensive security scan, we identified 16 tables with overly permissive SELECT policies:
- Tables exposing vulnerability/CVE data to all authenticated users
- System tables (`system_state`, `system_liveness`) readable by non-admins
- Agent version/release information accessible without role checks

## Decision

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

## Implementation

All policies use the existing `public.has_role()` SECURITY DEFINER function to avoid RLS recursion:

```sql
CREATE POLICY "admin_only_select_vulnerability_baseline" 
ON public.software_vulnerability_baseline
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'super_admin')
);
```

## Consequences

### Positive
- Sensitive CVE/vulnerability data only visible to admins
- System state tables protected from unauthorized access
- Follows principle of least privilege

### Negative
- Frontend components querying these tables may need updates
- Non-admin users lose visibility to previously accessible data

### Remaining Linter Warnings
3 remaining warnings are for `service_role` policies with `USING(true)` - expected and safe per ADR-023.

## Migration Files
- `20260113_rls_hardening_phase2.sql`

## Related
- [ADR-023: RLS Hardening](./ADR-023-rls-hardening.md)
- [SECURITY_ARCHITECTURE.md](../SECURITY_ARCHITECTURE.md)
