# ADR-023: RLS Hardening - Removal of Public Permissive Policies

## Status
**Accepted** - 2026-01-07

## Context

During security audit, we identified dangerous RLS policies that used:
- `USING (true)` or `WITH CHECK (true)` for UPDATE/DELETE/INSERT operations
- Policies granted to `public` role instead of specific roles
- Direct access to sensitive columns (`hmac_secret`, `token`)

These patterns violate the principle of least privilege and could allow:
- Unauthorized data modification
- Privilege escalation attacks
- Sensitive data exposure

## Decision

### 1. Restrict All Permissive Policies to `service_role`

All policies that require `USING (true)` or `WITH CHECK (true)` are now restricted to `service_role`:

```sql
-- BEFORE (dangerous)
CREATE POLICY "Service role can insert" ON table FOR INSERT
  TO public WITH CHECK (true);

-- AFTER (secure)
CREATE POLICY "Only service role can insert" ON table FOR INSERT
  TO service_role WITH CHECK (true);
```

### 2. Tables with Hardened Policies

| Table | Operation | Previous Grant | New Grant |
|-------|-----------|----------------|-----------|
| `agent_disk_metrics` | DELETE | public | service_role |
| `agent_signing_keys` | UPDATE | public | service_role |
| `job_executions` | UPDATE | public | service_role |
| `playbook_executions` | UPDATE | public | service_role |
| `risk_delta_snapshots` | UPDATE | public | service_role |
| `security_reports` | ALL | public | service_role |
| `agent_evidence_logs` | INSERT | public | service_role |
| `agent_safe_mode_events` | INSERT | public | service_role |
| `ai_rejected_decisions` | INSERT | public | service_role |
| `audit_integrity_checks` | INSERT | public | service_role |
| `audit_report_verifications` | INSERT | public | service_role |
| `blocked_access_attempts` | INSERT | public | service_role |
| `decision_events` | INSERT | public | service_role |
| `edge_function_metrics` | INSERT | public | service_role |
| `forensic_snapshots` | INSERT | public | service_role |
| `risk_decision_log` | INSERT | public | service_role |
| `rls_test_results` | INSERT | public | service_role |
| `score_governance_log` | INSERT | public | service_role |
| `slo_measurements` | INSERT | public | service_role |
| `subscription_events` | INSERT | public | service_role |
| `tenant_risk_scores` | INSERT | public | service_role |

### 3. Secure Views for Sensitive Data

Created views that exclude sensitive columns:

| View | Base Table | Excluded Columns | Purpose |
|------|------------|------------------|---------|
| `agents_public` | `agents` | `hmac_secret` | Frontend agent queries |
| `invites_safe` | `invites` | `token` | Frontend invite management |

Both views use `security_invoker = on` to inherit the caller's permissions.

## Consequences

### Positive
- Eliminates public role access to sensitive operations
- Prevents unauthorized INSERT/UPDATE/DELETE via direct table access
- Sensitive fields (`hmac_secret`, `token`) never exposed to frontend
- Maintains full functionality via Edge Functions using service_role

### Negative
- Frontend code must use views instead of direct table access
- Edge Functions required for write operations on affected tables

### Neutral
- Linter will still report warnings for `service_role` policies with `USING(true)` - this is expected and safe since only backend has access

## Migration Files

1. `20260107_rls_hardening_critical_policies.sql` - Fixed UPDATE/DELETE/ALL policies
2. `20260107_rls_hardening_insert_policies_1.sql` - Fixed INSERT policies (part 1)
3. `20260107_rls_hardening_insert_policies_2.sql` - Fixed INSERT policies (part 2)
4. `20260107_rls_hardening_secure_views.sql` - Created secure views

## Validation

Run the security gate script to verify:

```bash
psql -f scripts/security-gate.sql
```

Expected output: No dangerous public policies found.

## Related

- [SECURITY_INVARIANTS_CHANGELOG.md](../SECURITY_INVARIANTS_CHANGELOG.md)
- [SECURITY_ARCHITECTURE.md](../SECURITY_ARCHITECTURE.md)
- INV-001: Cross-Tenant Isolation
- INV-002: HMAC Authentication
