# E2E Test Suite - Complete Documentation

## Overview

Este documento lista todos os testes E2E do sistema, suas dependências e como executá-los.

## Environment Variables

Todas os testes E2E usam as seguintes variáveis de ambiente padronizadas:

```bash
# Required for all tests
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...

# Optional - Test credentials
TEST_ADMIN_EMAIL=admin@test.com
TEST_ADMIN_PASSWORD=Test123!@#

# Super Admin tests
SUPER_ADMIN_EMAIL=super@cybershield.test
SUPER_ADMIN_PASSWORD=SuperSecure123!@#
```

## Test Categories

### 🔴 P0: Core Security Tests (Blocking)

| File | Description | Priority |
|------|-------------|----------|
| `security-invariants.spec.ts` | Security invariants that must NEVER be violated | P0 |
| `red-team-security.spec.ts` | Red Team adversarial attack tests | P0 |
| `rls-cross-tenant-isolation.spec.ts` | RLS and cross-tenant isolation | P0 |

### 🟠 P1: Privilege & Access Control

| File | Description | Priority |
|------|-------------|----------|
| `super-admin-privilege-escalation.spec.ts` | Super Admin privilege escalation prevention | P1 |
| `super-admin-tenant-management.spec.ts` | Super Admin tenant management | P1 |
| `admin-access.spec.ts` | Admin access control | P1 |

### 🟡 P2: Agent Security

| File | Description | Priority |
|------|-------------|----------|
| `agent-hmac-improvements.spec.ts` | Agent HMAC authentication | P2 |
| `agent-creation-post-rls-fix.spec.ts` | Agent creation with RLS | P2 |
| `input-validation.spec.ts` | Input validation and sanitization | P2 |
| `agent-name-validation.spec.ts` | Agent name validation | P2 |

### 🟢 P3: Functional Tests

| File | Description | Priority |
|------|-------------|----------|
| `dashboard-agent-health.spec.ts` | Agent health dashboard | P3 |
| `dashboard-installation-logs.spec.ts` | Installation logs dashboard | P3 |
| `dashboard-installation-pipeline.spec.ts` | Installation pipeline dashboard | P3 |
| `agent-health-filters.spec.ts` | Agent health filters | P3 |
| `agent-status-badges.spec.ts` | Agent status badges | P3 |
| `rules-engine-management.spec.ts` | Rules engine management | P3 |
| `dns-filter.spec.ts` | DNS filter functionality | P3 |

### 🔵 P4: Agent Installation Flow

| File | Description | Priority |
|------|-------------|----------|
| `complete-agent-flow.spec.ts` | Complete agent flow | P4 |
| `complete-enrollment-flow.spec.ts` | Complete enrollment flow | P4 |
| `complete-installer-flow.spec.ts` | Complete installer flow | P4 |
| `agent-installation.spec.ts` | Agent installation | P4 |
| `one-click-installation.spec.ts` | One-click installation | P4 |
| `installer-download.spec.ts` | Installer download | P4 |
| `linux-agent-installation.spec.ts` | Linux agent installation | P4 |
| `macos-agent-installation.spec.ts` | macOS agent installation | P4 |

## Running Tests

### Quick Commands

```bash
# Run all security tests (recommended for CI/CD)
./e2e/run-all-security-tests.sh --full

# Run only core security tests (fast)
./e2e/run-all-security-tests.sh --fast

# Run Red Team tests
./e2e/run-all-security-tests.sh --red-team

# Run invariant tests
./e2e/run-all-security-tests.sh --invariants

# Run RLS tests
./e2e/run-all-security-tests.sh --rls

# Run Super Admin tests
./e2e/run-all-security-tests.sh --super-admin
```

### Individual Tests

```bash
# Run specific test file
npx playwright test e2e/security-invariants.spec.ts

# Run with debug mode
npx playwright test e2e/red-team-security.spec.ts --debug

# Run with headed browser
npx playwright test e2e/admin-access.spec.ts --headed

# Run with specific reporter
npx playwright test e2e/rls-cross-tenant-isolation.spec.ts --reporter=html
```

### Run All Tests

```bash
# All E2E tests
npx playwright test e2e/

# All security tests (glob pattern)
npx playwright test e2e/*security*.spec.ts e2e/*rls*.spec.ts

# Generate coverage report
npx playwright test e2e/ --reporter=html && npx playwright show-report
```

## Test Dependencies

### Required Test Users

For Super Admin tests, the following users must exist in the database:

```typescript
// e2e/super-admin-privilege-escalation.spec.ts
const SUPER_ADMIN_USER = {
  email: 'super@cybershield.test',
  password: 'SuperSecure123!@#',
  role: 'super_admin'
};

const REGULAR_ADMIN_USER = {
  email: 'admin@cybershield.test',
  password: 'AdminSecure123!@#',
  role: 'admin'
};

const OPERATOR_USER = {
  email: 'operator@cybershield.test',
  password: 'OperatorSecure123!@#',
  role: 'operator'
};
```

### Setup Test Users

```bash
# Run the setup script
npx ts-node tests/setup-security-test-users.ts
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/security-tests.yml
name: Security E2E Tests
on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: ./e2e/run-all-security-tests.sh --full
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## Compliance Matrix

| Control | Test File | SOC2 | ISO 27001 |
|---------|-----------|------|-----------|
| Cross-Tenant Isolation | `rls-cross-tenant-isolation.spec.ts` | ✅ | ✅ |
| Privilege Escalation Prevention | `super-admin-privilege-escalation.spec.ts` | ✅ | ✅ |
| Authentication Bypass | `security-invariants.spec.ts` | ✅ | ✅ |
| SQL Injection Prevention | `red-team-security.spec.ts` | ✅ | ✅ |
| Rate Limiting | `red-team-security.spec.ts` | ✅ | ✅ |
| HMAC Validation | `agent-hmac-improvements.spec.ts` | ✅ | ✅ |
| Input Validation | `input-validation.spec.ts` | ✅ | ✅ |

## Removed Redundant Tests

The following files were removed as they were redundant:

- ❌ `rls-multi-tenant.spec.ts` - Covered by `rls-cross-tenant-isolation.spec.ts`
- ❌ `comprehensive-security-audit.spec.ts` - Covered by `security-invariants.spec.ts` and `red-team-security.spec.ts`

## Troubleshooting

### Tests Skipped

If tests are being skipped, check:

1. Environment variables are set correctly
2. Supabase project is running
3. Test users exist in the database

### Authentication Failures

```bash
# Check if test users exist
npx ts-node -e "
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
client.auth.signInWithPassword({
  email: 'admin@test.com',
  password: 'Test123!@#'
}).then(console.log);
"
```

### Timeout Issues

```bash
# Increase timeout for slow connections
npx playwright test e2e/security-invariants.spec.ts --timeout=120000
```
