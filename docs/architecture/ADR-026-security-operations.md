# ADR-026: Security Operations Framework

## Status
Accepted

## Date
2026-01-14

## Context

The CyberShield system has been declared operationally secure with robust RLS policies, tenant isolation, and defense-in-depth architecture. However, security is not a one-time achievement—it requires continuous verification and automated response to threats.

### Identified Gaps
1. **No automated RLS testing**: RLS policies were tested manually, with no continuous verification
2. **No unified security dashboard**: Security metrics were scattered across multiple views
3. **No automatic threat response**: Kill switch required manual intervention
4. **Views without security_invoker**: 44 views lacked the `security_invoker = true` attribute

## Decision

Implement a Security Operations Framework (SOF) consisting of four pillars:

### 1. Automated RLS Testing Framework

**Edge Function**: `run-rls-tests`
- Executes comprehensive RLS test matrix every 6 hours
- Records results in `rls_test_results` table
- Creates alerts on any failure

**Test Categories**:
- `rls_coverage`: All tables have RLS enabled
- `policy_coverage`: Critical tables have policies
- `view_security`: Views have security_invoker
- `access_control`: Anonymous access blocked
- `audit_integrity`: Security logs are append-only

### 2. Unified Security Dashboard (Control Plane)

**Component**: `SecurityControlPlane.tsx`

**KPIs Displayed**:
| Metric | Source | Threshold |
|--------|--------|-----------|
| RLS Coverage % | pg_class | < 95% = warning |
| Views without invoker | pg_views | > 0 = critical |
| Critical events (24h) | security_logs | > 10 = warning |
| Blocked attacks (24h) | security_logs | informational |
| Open critical alerts | system_alerts | > 0 = attention |
| RLS test failures | rls_test_results | > 0 = critical |
| System mode | system_global_state | emergency = red |

### 3. Automatic Kill Switch

**Trigger Conditions**:
- RLS test failure detected
- Table without RLS found
- Critical security event spike (> 10 in 10 min)

**Action**:
```sql
INSERT INTO system_global_state (mode, reason, triggered_by)
VALUES ('emergency_stop', 'Auto-triggered: {reason}', system_uuid);
```

**Recovery**:
- Requires super admin manual intervention
- Audit log entry created
- Notification sent

### 4. Continuous Verification

**Scheduled Jobs**:
| Job | Frequency | Function |
|-----|-----------|----------|
| rls_automated_tests | Every 6h | run-rls-tests |
| security_alert_dispatcher | On-demand + cron | security-alert-dispatcher |
| integrity_sentinel | Every 15min | integrity-sentinel |

## Consequences

### Positive
- **Continuous Assurance**: Security is verified automatically, not assumed
- **Fast Response**: Threats trigger automatic containment within seconds
- **Audit Ready**: All security events are logged with timestamps
- **Single Source of Truth**: One dashboard shows complete security status
- **SOC2/ISO Compliant**: Framework meets compliance requirements

### Negative
- **Operational Overhead**: More moving parts to maintain
- **False Positives**: Automatic kill switch may activate unnecessarily
- **Resource Usage**: Continuous testing consumes database resources

### Neutral
- **Learning Curve**: Team needs to understand new security tools
- **Alert Fatigue**: Need to tune thresholds to avoid noise

## Implementation

### Files Created/Modified
1. `src/components/security/SecurityControlPlane.tsx` - Control plane UI
2. `supabase/functions/run-rls-tests/index.ts` - RLS test runner
3. `e2e/security-control-plane.spec.ts` - E2E tests for control plane
4. `e2e/rls-automated-tests.spec.ts` - E2E tests for RLS automation

### Database Changes
- Added `security_invoker = true` to all 44 views (batch migration)
- Created `v_security_dashboard` view for consolidated metrics
- Created `check_security_thresholds()` RPC function
- Created `auto_activate_emergency_mode()` trigger function

### E2E Test Coverage
| Test ID | Description | Category |
|---------|-------------|----------|
| SEC-CP-001 | Non-admin blocked from control plane | Access Control |
| SEC-CP-002 | Super admin can access dashboard | Access Control |
| SEC-CP-003 | RLS results are recorded | Data Integrity |
| SEC-CP-004 | run-rls-tests executes | Automation |
| SEC-KS-001 | Super admin can activate kill switch | Kill Switch |
| SEC-KS-002 | Regular users cannot activate kill switch | Kill Switch |
| RLS-AUTO-001 | Test function returns proper structure | Automation |
| RLS-AUTO-004 | Anonymous blocked from protected tables | RLS |
| RLS-AUTO-005 | Security logs are append-only | Audit |

## Security Invariants Guaranteed

After this implementation, the following invariants are continuously verified:

1. **All tables have RLS enabled** - Checked every 6 hours
2. **All views have security_invoker** - Verified at deploy time
3. **Tenant isolation is enforced** - Tested automatically
4. **Security logs are immutable** - Append-only enforced
5. **Critical tables are protected** - Access blocked to anon
6. **Kill switch is operational** - Ready for immediate activation

## Monitoring

### Alerts to Configure
```yaml
alerts:
  - name: rls_test_failure
    condition: failed_tests > 0
    severity: critical
    action: notify + kill_switch

  - name: tables_without_rls
    condition: count > 0
    severity: critical
    action: block_deploy

  - name: security_event_spike
    condition: critical_events_10min > 10
    severity: warning
    action: notify
```

## Related ADRs
- ADR-023: RLS Hardening
- ADR-024: Security Invariants
- ADR-025: Multi-Tenant Isolation

## References
- [OWASP Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [SOC2 Type II Requirements](https://www.aicpa.org/soc2)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
