# Deployment Checklist - CyberShield Agent System

This checklist ensures all critical components are validated before deploying agent installers to production.

## Pre-Deployment Validation

### 1. ASCII Compliance (CRITICAL)

- [ ] Run ASCII Guard check:
  ```bash
  npm run ascii:check
  ```
- [ ] Verify no failures reported
- [ ] All PowerShell scripts must be ASCII-only (no emojis, accents, smart quotes)

**Files to verify:**
- `public/agent-scripts/cybershield-agent-windows-v3.ps1`
- `supabase/functions/_shared/agent-script-windows-content.ts`
- `supabase/functions/_shared/installer-template.ts`

### 2. Agent Script Synchronization

- [ ] Verify source and embedded scripts are in sync:
  ```bash
  npm run sync:agent
  ```
- [ ] Check that no changes are needed
- [ ] If changes are needed, commit and push

**Files that must match:**
- Source: `public/agent-scripts/cybershield-agent-windows-v3.ps1`
- Embedded: `supabase/functions/_shared/agent-script-windows-content.ts`

### 3. PowerShell 5.1 Compatibility

- [ ] Validate agent script syntax:
  ```powershell
  .\scripts\verificar-installer-agente.ps1 -ScriptPath "public\agent-scripts\cybershield-agent-windows-v3.ps1"
  ```
- [ ] Verify all validations pass
- [ ] No PowerShell 7+ syntax (e.g., ternary operators `? :`)

### 4. Jobs v3 Compliance

- [ ] Verify `StartedAt` parameter exists in agent script
- [ ] Check `Submit-JobResult` function includes:
  - `job_id`
  - `status` ("completed" or "failed")
  - `output` (JSON)
  - `error_message`
  - `execution_time_seconds`
  - `started_at` (ISO 8601)

### 5. Edge Functions Deployment

- [ ] All Edge Functions deployed successfully
- [ ] Check deployment logs for errors:
  ```bash
  # Check in Lovable Cloud UI or Supabase Dashboard
  ```
- [ ] Critical functions to verify:
  - `serve-installer`
  - `submit-job-result`
  - `heartbeat`
  - `poll-jobs`

### 6. Database Migrations

- [ ] All pending migrations applied
- [ ] Verify RLS policies active
- [ ] Check critical tables:
  - `agents`
  - `jobs`
  - `agent_tokens`
  - `enrollment_keys`
  - `performance_metrics`

### 7. Placeholder Validation

- [ ] Test installer generation:
  ```bash
  # Generate test installer via UI
  # Download and inspect for placeholders
  ```
- [ ] Verify NO `{{...}}` placeholders remain
- [ ] All values properly substituted:
  - `{{SERVER_URL}}`
  - `{{AGENT_TOKEN}}`
  - `{{HMAC_SECRET}}`
  - `{{AGENT_NAME}}`
  - `{{AGENT_SCRIPT_CONTENT}}`

### 8. System Health Check

- [ ] Access System Health Dashboard at `/admin/system-health`
- [ ] Verify health score >80%
- [ ] Check for alerts or warnings
- [ ] Review slow operations list

### 9. Performance Metrics

- [ ] No Edge Functions with avg duration >2s
- [ ] Error rate <5% for all functions
- [ ] Database queries optimized (check indexes)

### 10. CI/CD Pipeline

- [ ] All GitHub Actions workflows passing
- [ ] Guardian job validates:
  - ASCII compliance
  - System validation
  - Agent script sync
- [ ] E2E tests passing (if available)

## Deployment Steps

### Step 1: Code Freeze

- [ ] All PRs merged and approved
- [ ] No pending changes in working directory
- [ ] Git status clean

### Step 2: Pre-Flight Validation

- [ ] Run complete validation suite:
  ```bash
  npm run validate:all
  ```
- [ ] Expected output: All checks PASS
- [ ] Fix any failures before proceeding

### Step 3: Sync Agent Scripts

- [ ] Execute sync command:
  ```bash
  npm run sync:agent
  ```
- [ ] Commit any generated changes
- [ ] Push to repository

### Step 4: Deploy Edge Functions

- [ ] Deploy via Lovable Cloud UI
- [ ] Verify deployment success in logs
- [ ] Test critical endpoints:
  - `/functions/v1/health`
  - `/functions/v1/serve-installer`

### Step 5: Generate Test Installer

- [ ] Navigate to `/installer` in UI
- [ ] Generate installer for test agent: `TEST-DEPLOY-VALIDATION`
- [ ] Download `.ps1` file

### Step 6: Validate Test Installer

- [ ] Run validation script:
  ```powershell
  .\scripts\verificar-installer-agente.ps1 -ScriptPath "C:\Downloads\install-TEST-DEPLOY-VALIDATION-windows.ps1"
  ```
- [ ] Verify: `[SUCCESS] Todas as validacoes criticas PASSARAM`

### Step 7: Install on Test VM

- [ ] Provision clean Windows Server 2022 VM
- [ ] Run installer as Administrator
- [ ] Wait 2-3 minutes for initial heartbeat

### Step 8: Verify Test Agent

- [ ] Check System Health Dashboard
- [ ] Agent shows as "healthy" (green)
- [ ] Last heartbeat <5 minutes ago
- [ ] Agent status: `active`

### Step 9: Test Jobs v3

- [ ] Create test job via `/jobs` UI
- [ ] Job type: `collect_info`
- [ ] Target: `TEST-DEPLOY-VALIDATION`
- [ ] Wait for completion

### Step 10: Verify Jobs v3 Execution

- [ ] Job status: `completed`
- [ ] `output` field populated (JSON)
- [ ] `started_at` and `finished_at` timestamps present
- [ ] `execution_time_seconds` calculated correctly

### Step 11: Run Diagnostic Queries

- [ ] Execute queries from `scripts/diagnostic-queries.sql`
- [ ] Query #4 (v3 Adoption): Should show 100% for test agent
- [ ] Query #10 (System Health Summary): Should show healthy metrics

### Step 12: Performance Check

- [ ] Access `/admin/performance-metrics`
- [ ] Verify no slow operations for test agent
- [ ] Check Edge Function response times

## Post-Deployment Monitoring

### First 24 Hours

- [ ] Monitor System Health Dashboard every 2 hours
- [ ] Check for stuck agents (Query #1)
- [ ] Review 401 errors (Query #2)
- [ ] Verify jobs v3 adoption increasing

### First Week

- [ ] Daily health score check (target: >90%)
- [ ] Weekly performance metrics review
- [ ] Address any slow operations (>2s)
- [ ] Monitor installation success rate (target: >95%)

### Ongoing

- [ ] Weekly: Review System Health Dashboard
- [ ] Monthly: Run all diagnostic queries
- [ ] Quarterly: Full system audit

## Rollback Plan

### If Critical Issue Detected

1. **Stop New Installations**
   - Disable installer generation in UI (if possible)
   - Communicate issue to team

2. **Assess Impact**
   - Run diagnostic queries
   - Identify affected agents
   - Determine severity

3. **Execute Rollback**
   - Revert Edge Functions to previous version
   - If needed, revert database migrations
   - Test with single agent

4. **Verify Rollback**
   - Generate test installer
   - Validate on test VM
   - Confirm issue resolved

5. **Root Cause Analysis**
   - Review deployment logs
   - Check what changed
   - Document findings

6. **Fix and Redeploy**
   - Address root cause
   - Follow full checklist again
   - Extra testing before production

## Emergency Contacts

### Critical Issues

- **System Down:** Check `/admin/system-health`
- **Edge Functions Failing:** Check Supabase logs
- **Database Issues:** Run diagnostic queries

### Escalation Path

1. Check System Health Dashboard
2. Run diagnostic queries
3. Review Edge Function logs
4. Check GitHub Actions status
5. Contact DevOps team

## Sign-Off

### Pre-Deployment

- [ ] All checklist items completed
- [ ] Test agent validated successfully
- [ ] Jobs v3 working correctly
- [ ] No outstanding critical issues

**Deployed By:** _______________  
**Date:** _______________  
**Version:** _______________  

### Post-Deployment (24h)

- [ ] No critical issues reported
- [ ] Health score >80%
- [ ] Jobs v3 adoption increasing
- [ ] Performance metrics acceptable

**Verified By:** _______________  
**Date:** _______________  

## Notes

Use this section to document any special considerations, known issues, or deviations from the standard checklist:

---
