# E2E Test Suite Documentation

Complete documentation for the CyberShield E2E test suite.

## Environment Variables

Required environment variables (set in `.env.test` or `.env`):

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key

# Test User Credentials
TEST_ADMIN_EMAIL=admin@test.com
TEST_ADMIN_PASSWORD=Test123!@#
TEST_SUPER_ADMIN_EMAIL=super@cybershield.test
TEST_SUPER_ADMIN_PASSWORD=SuperAdmin123!
TEST_OPERATOR_EMAIL=operator@cybershield.test
TEST_OPERATOR_PASSWORD=Operator123!
```

## Test Categories

### P0 - Core Security Tests (Critical)
| File | Description |
|------|-------------|
| `red-team-security.spec.ts` | Red team attack vectors (SQLi, XSS, IDOR, privilege escalation) |
| `security-invariants.spec.ts` | SOC2/ISO 27001 security invariants |
| `rls-cross-tenant-isolation.spec.ts` | Multi-tenant RLS isolation |

### P1 - Privilege & Access Control
| File | Description |
|------|-------------|
| `super-admin-privilege-escalation.spec.ts` | Privilege escalation prevention |
| `super-admin-tenant-management.spec.ts` | Tenant management security |
| `admin-access.spec.ts` | Admin access controls |
| `update-user-role.spec.ts` | Role update validation |
| `multiple-roles-validation.spec.ts` | Multiple roles handling |

### P2 - Agent Security & Flow
| File | Description |
|------|-------------|
| `agent-hmac-complete-flow.spec.ts` | HMAC authentication flow |
| `complete-agent-flow.spec.ts` | Complete agent lifecycle |
| `complete-enrollment-flow.spec.ts` | Enrollment → job flow |
| `agent-creation-post-rls-fix.spec.ts` | Agent creation after RLS fix |

### P3 - Installer & Validation
| File | Description |
|------|-------------|
| `complete-installer-flow.spec.ts` | Complete installer flow |
| `one-click-installation.spec.ts` | One-click installation |
| `linux-agent-installation.spec.ts` | Linux agent installation |
| `macos-agent-installation.spec.ts` | macOS agent installation |
| `installer-token-validation.spec.ts` | Token validation |
| `ps1-sha256-validation.spec.ts` | PowerShell SHA256 validation |
| `input-validation.spec.ts` | Input validation security |
| `agent-name-validation.spec.ts` | Agent name validation |

### P4 - Dashboard & Features
| File | Description |
|------|-------------|
| `dashboard-agent-health.spec.ts` | Agent health dashboard |
| `dashboard-installation-logs.spec.ts` | Installation logs explorer |
| `dashboard-installation-pipeline.spec.ts` | Installation pipeline monitor |
| `agent-status-badges.spec.ts` | Status badge display |
| `agent-health-filters.spec.ts` | Health monitor filters |
| `agent-quick-actions.spec.ts` | Quick action buttons |
| `agent-scheduled-task-parameters.spec.ts` | Scheduled task params |

### P4 - Feature Tests
| File | Description |
|------|-------------|
| `dns-filter.spec.ts` | DNS filter functionality |
| `rules-engine-management.spec.ts` | Rules engine management |
| `process-control.spec.ts` | Process control features |
| `ai-actions.spec.ts` | AI-powered actions |
| `member-limits.spec.ts` | Member limit enforcement |

### P4 - Payment & Analytics
| File | Description |
|------|-------------|
| `stripe-checkout-flow.spec.ts` | Stripe checkout flow |
| `stripe-payment.spec.ts` | Stripe payment handling |
| `installation-analytics.spec.ts` | Installation analytics |
| `installation-health.spec.ts` | Installation health metrics |

### Other Tests
| File | Description |
|------|-------------|
| `humanized-language.spec.ts` | Humanized Portuguese language |
| `load-test.spec.ts` | Performance/load testing |

## Running Tests

### Using the Unified Script

```bash
# Make script executable
chmod +x e2e/run-all-e2e-tests.sh

# Run all tests
./e2e/run-all-e2e-tests.sh --all

# Run by category
./e2e/run-all-e2e-tests.sh --security
./e2e/run-all-e2e-tests.sh --agent
./e2e/run-all-e2e-tests.sh --installer
./e2e/run-all-e2e-tests.sh --dashboard
./e2e/run-all-e2e-tests.sh --payment
./e2e/run-all-e2e-tests.sh --validation
./e2e/run-all-e2e-tests.sh --hmac
./e2e/run-all-e2e-tests.sh --admin
./e2e/run-all-e2e-tests.sh --features

# Quick smoke test
./e2e/run-all-e2e-tests.sh --smoke

# With options
./e2e/run-all-e2e-tests.sh --security --html       # HTML report
./e2e/run-all-e2e-tests.sh --agent --headed        # Visible browser
./e2e/run-all-e2e-tests.sh --all --workers=8       # 8 parallel workers
./e2e/run-all-e2e-tests.sh --list                  # List all tests
```

### Using Playwright Directly

```bash
# Run all tests
npx playwright test e2e/

# Run specific category
npx playwright test e2e/*security*.spec.ts
npx playwright test e2e/*agent*.spec.ts
npx playwright test e2e/*dashboard*.spec.ts

# Run single file
npx playwright test e2e/red-team-security.spec.ts

# With options
npx playwright test e2e/ --headed --debug
npx playwright test e2e/ --reporter=html
npx playwright test e2e/ --workers=4 --retries=2

# List all tests
npx playwright test e2e/ --list

# View report
npx playwright show-report
```

## Test Dependencies

### Required Test Users

| Role | Email | Purpose |
|------|-------|---------|
| Super Admin | `super@cybershield.test` | Privilege escalation tests |
| Admin | `admin@test.com` | General admin tests |
| Operator | `operator@cybershield.test` | Limited access tests |

### Database Setup

```sql
-- Create test users (run in Supabase SQL Editor)
-- See tests/setup-security-test-users.ts for complete setup
```

## CI/CD Integration

### GitHub Actions

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Install Playwright
        run: npx playwright install --with-deps
        
      - name: Run E2E tests
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
          TEST_ADMIN_EMAIL: ${{ secrets.TEST_ADMIN_EMAIL }}
          TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
        run: npx playwright test e2e/ --reporter=github
        
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## Compliance Matrix

| Control | Test File | SOC2 | ISO 27001 |
|---------|-----------|------|-----------|
| Access Control | `admin-access.spec.ts` | CC6.1 | A.9.2 |
| Data Isolation | `rls-cross-tenant-isolation.spec.ts` | CC6.1 | A.9.4 |
| Input Validation | `input-validation.spec.ts` | CC6.6 | A.14.2 |
| Authentication | `agent-hmac-complete-flow.spec.ts` | CC6.1 | A.9.4 |
| Privilege Escalation | `super-admin-privilege-escalation.spec.ts` | CC6.1 | A.9.2 |
| Injection Prevention | `red-team-security.spec.ts` | CC6.6 | A.14.2 |

## Removed Redundant Tests

The following files were removed due to redundancy:

| Removed File | Reason | Covered By |
|--------------|--------|------------|
| `rls-multi-tenant.spec.ts` | Duplicate coverage | `rls-cross-tenant-isolation.spec.ts` |
| `comprehensive-security-audit.spec.ts` | 90% overlap | `security-invariants.spec.ts` |
| `agent-flow.spec.ts` | 90% overlap | `complete-agent-flow.spec.ts` |
| `installer-download.spec.ts` | 80% overlap | `complete-installer-flow.spec.ts` |
| `serve-installer.spec.ts` | 70% overlap | Other installer tests |
| `heartbeat-validation.spec.ts` | 90% overlap | `agent-hmac-complete-flow.spec.ts` |
| `agent-hmac-improvements.spec.ts` | 85% overlap | `agent-hmac-complete-flow.spec.ts` |

## Troubleshooting

### Tests Skipped
- Ensure test users exist in database
- Check environment variables are set correctly
- Verify Supabase project is running

### Authentication Failures
```bash
# Debug authentication
DEBUG=pw:api npx playwright test e2e/admin-access.spec.ts --headed
```

### Timeout Issues
```bash
# Increase timeout
npx playwright test e2e/ --timeout=120000
```

### View Test Results
```bash
# Generate and view HTML report
npx playwright test e2e/ --reporter=html
npx playwright show-report
```
