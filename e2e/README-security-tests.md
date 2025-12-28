# 🔐 E2E Security Tests Documentation

Comprehensive documentation for end-to-end security tests covering Red Team attack vectors, RLS validation, and access control enforcement.

## 📋 Overview

The E2E security test suite validates critical security invariants:

| Test File | Purpose | Priority |
|-----------|---------|----------|
| `red-team-security.spec.ts` | Adversarial attack simulation | P0 |
| `security-invariants.spec.ts` | Core security rule validation | P0 |
| `rls-cross-tenant-isolation.spec.ts` | Multi-tenant data isolation | P0 |
| `super-admin-privilege-escalation.spec.ts` | Privilege escalation prevention | P1 |
| `comprehensive-security-audit.spec.ts` | Full security audit | P1 |

## 🧪 Test Categories

### RED-001: RLS Bypass Prevention

Tests that validate Row-Level Security cannot be circumvented:

```typescript
// Attempts blocked:
- Direct UPDATE via REST API without service_role
- Direct INSERT bypassing application logic
- Status field manipulation on approval_requests
- Cross-tenant data access
```

**Expected Outcomes:**
- HTTP 403 Forbidden or empty result set
- No data modification occurs
- Audit log entry created for attempt

### RED-002: Trigger Injection Prevention

Tests that validate Edge Functions reject unauthorized calls:

```typescript
// Attempts blocked:
- Calls without authentication
- Calls with forged X-Internal-Secret
- Calls with invalid/expired JWT tokens
- Cross-tenant trigger execution
```

**Expected Outcomes:**
- HTTP 401 Unauthorized or 403 Forbidden
- No trigger execution occurs
- Audit log entry created for attempt

### RED-003: Rate Limit Enforcement

Tests that validate rate limiting protections:

```typescript
// Limits enforced:
- Max 10 pending approvals per tenant
- Max 5 password change attempts per hour
- Max 100 API requests per minute (general)
```

**Expected Outcomes:**
- HTTP 429 Too Many Requests when limit exceeded
- Rate limit logged in audit_logs
- Limit resets after window expires

### RED-004: Additional Security Invariants

Tests for supplementary security controls:

```typescript
// Controls validated:
- Audit logs are non-writable via REST
- User roles cannot be modified via REST
- Sensitive columns (hmac_secret, key_secret) are not exposed
- Token logging is sanitized
```

### RED-005: Cross-Tenant Isolation

Tests that validate strict tenant boundaries:

```typescript
// Isolation verified:
- Users cannot see other tenants' data
- Users cannot modify other tenants' data
- Trigger functions validate tenant ownership
- Super admins have explicit cross-tenant access only
```

## 🛠️ Setup

### Prerequisites

1. **Environment Variables** (`.env.test`):

```env
# Required
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key

# Optional - for authenticated tests
TEST_ADMIN_EMAIL=admin@test.com
TEST_ADMIN_PASSWORD=Test1234!
TEST_SUPER_ADMIN_EMAIL=super@cybershield.test
TEST_SUPER_ADMIN_PASSWORD=SuperSecure123!
```

2. **Test Users** (create via SQL or Admin API):

```sql
-- See supabase/seed-test-users.sql for full script
INSERT INTO public.user_roles (user_id, tenant_id, role)
VALUES 
  ('admin-uuid', 'tenant-a-uuid', 'admin'),
  ('viewer-uuid', 'tenant-a-uuid', 'viewer');
```

3. **Test Tenants**:

```sql
INSERT INTO public.tenants (id, name, slug, owner_user_id)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'Test Tenant A', 'test-tenant-a', 'owner-uuid'),
  ('b0000000-0000-0000-0000-000000000002', 'Test Tenant B', 'test-tenant-b', 'owner-uuid');
```

## 🚀 Running Tests

### All Security Tests

```bash
# Run all security-related E2E tests
npx playwright test red-team security-invariants rls-cross-tenant

# With HTML reporter
npx playwright test red-team --reporter=html
```

### Specific Test Suites

```bash
# Red Team attack simulation
npx playwright test red-team-security.spec.ts

# Security invariants
npx playwright test security-invariants.spec.ts

# Cross-tenant isolation
npx playwright test rls-cross-tenant-isolation.spec.ts

# Super admin privilege tests
npx playwright test super-admin-privilege-escalation.spec.ts
```

### Debug Mode

```bash
# Run with debug UI
npx playwright test red-team-security --debug

# Run with headed browser
npx playwright test red-team-security --headed
```

### View Reports

```bash
# Open HTML report
npx playwright show-report
```

## 📊 Coverage Matrix

| Security Vector | Test ID | Severity | Status |
|-----------------|---------|----------|--------|
| RLS UPDATE bypass | RED-001-1 | Critical | ✅ |
| RLS INSERT bypass | RED-001-2 | Critical | ✅ |
| Trigger no-auth | RED-002-1 | Critical | ✅ |
| Trigger forged secret | RED-002-2 | Critical | ✅ |
| Rate limit approval | RED-003-1 | High | ✅ |
| Audit log write | RED-004-1 | High | ✅ |
| Sensitive column exposure | RED-004-2 | High | ✅ |
| Cross-tenant SELECT | RED-005-1 | Critical | ✅ |
| Cross-tenant UPDATE | RED-005-2 | Critical | ✅ |

## 🔧 Test Fixtures

### Security Test Users (`e2e/fixtures/security-test-users.ts`)

```typescript
import { SECURITY_TEST_USERS } from './fixtures/security-test-users';

// Available users:
SECURITY_TEST_USERS.superAdmin    // Cross-tenant access
SECURITY_TEST_USERS.adminTenantA  // Admin for Tenant A
SECURITY_TEST_USERS.adminTenantB  // Admin for Tenant B
SECURITY_TEST_USERS.operator      // Limited permissions
SECURITY_TEST_USERS.viewer        // Read-only access
SECURITY_TEST_USERS.member        // Basic member
```

### Security Test Helpers (`e2e/helpers/security-test-helpers.ts`)

```typescript
import {
  makeDirectRestRequest,
  callEdgeFunction,
  expectUnauthorized,
  expectForbidden,
  expectRateLimited,
} from './helpers/security-test-helpers';

// Make direct REST API call
const response = await makeDirectRestRequest({
  table: 'approval_requests',
  method: 'PATCH',
  data: { status: 'approved' },
  params: { id: 'eq.some-id' },
});

// Call Edge Function
const triggerResponse = await callEdgeFunction({
  functionName: 'evaluate-playbook-triggers',
  body: { tenant_id: 'test-tenant' },
});

// Validate security expectations
expect(expectUnauthorized(response)).toBe(true);
```

## 🚨 Failure Investigation

### Common Failure Patterns

1. **Test User Not Found**
   - Ensure test users exist in `auth.users`
   - Run `npx tsx tests/setup-test-users.ts`

2. **RLS Policy Missing**
   - Check that all tables have RLS enabled
   - Run `SELECT * FROM pg_tables WHERE schemaname = 'public'`

3. **Environment Variables Missing**
   - Copy `.env.test.example` to `.env.test`
   - Fill in required values

4. **Rate Limit Test Flaky**
   - May need to wait for rate limit window to reset
   - Check `rate_limits` table configuration

### Debugging Commands

```bash
# Check test environment
npx playwright test --list

# Run single test with trace
npx playwright test red-team-security -g "should block UPDATE" --trace on

# Generate trace file for analysis
npx playwright test red-team-security --trace retain-on-failure
```

## 📝 CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Security E2E Tests
  run: |
    npx playwright test red-team-security security-invariants rls-cross-tenant
  env:
    VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
    
- name: Upload Security Test Report
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: security-test-report
    path: playwright-report/
    retention-days: 30
```

## 📚 Related Documentation

- [Security Invariants](../docs/SECURITY_INVARIANTS.md)
- [Red Team Report](../docs/RED_TEAM_FINAL_REPORT.md)
- [RLS Policies](../supabase/migrations/)
- [Test User Setup](../tests/README-test-users-setup.md)

## 🔄 Maintenance

### Adding New Security Tests

1. Identify the security vector to test
2. Add test case to appropriate spec file
3. Update coverage matrix in this README
4. Add any new fixtures/helpers needed
5. Run full security test suite to validate

### Updating Test Users

1. Modify `e2e/fixtures/security-test-users.ts`
2. Update `supabase/seed-test-users.sql`
3. Run setup script: `npx tsx tests/setup-test-users.ts`
4. Execute SQL seed in Supabase

---

**Last Updated:** 2025-12-28  
**Maintainer:** Security Team  
**Review Frequency:** Monthly
