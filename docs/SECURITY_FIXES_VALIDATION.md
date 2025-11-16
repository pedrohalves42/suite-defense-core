# Security Fixes Validation Guide

## Overview

This document outlines the critical security fixes implemented in CyberShield to prevent privilege escalation and correct member limit enforcement.

## Fixes Implemented

### 1. Super Admin Privilege Escalation Prevention

**Problem**: Regular admins could potentially promote themselves or others to `super_admin` role via the UI or API.

**Solution**: Multi-layer defense implemented:

#### Layer 1: Backend Validation (Edge Function)
- **File**: `supabase/functions/update-user-role/index.ts`
- **Fix**: Zod schema now explicitly blocks `super_admin` role
- **Code**:
  ```typescript
  const UpdateRoleSchema = z.object({
    roles: z.array(z.enum(['admin', 'operator', 'viewer']))
      .refine((roles) => !roles.includes('super_admin' as any), {
        message: 'Cannot assign super_admin role through this endpoint. Contact system administrator.',
      }),
  });
  ```

#### Layer 2: Database RPC (Strongest Defense)
- **Function**: `update_user_role_rpc`
- **Fix**: Added two critical checks:
  1. Block assignment TO super_admin
  2. Block modification OF existing super_admins
- **Code**:
  ```sql
  -- Block super_admin assignment
  IF p_new_role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot assign super_admin role through this function. Contact system administrator.' 
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Block modification of existing super_admins
  IF v_old_role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot modify super_admin role. Contact system administrator.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  ```

#### Layer 3: Frontend UI
- **Files**: 
  - `src/components/members/MemberCard.tsx`
  - `src/pages/admin/Users.tsx`
- **Fix**: Removed `super_admin` from role selector dropdowns
- **Effect**: Users cannot even select super_admin in the UI

### 2. Member Limit Enforcement

**Problem**: `Members.tsx` was using `device_quantity` from subscription instead of `max_users` from `tenant_features`.

**Solution**: Fixed data source and added visual feedback:

#### Fix 1: Correct Data Source
- **File**: `src/pages/admin/Members.tsx`
- **Change**: Now uses `subscription.features.max_users.quota_limit` as primary source
- **Code**:
  ```typescript
  const maxUsersFeature = subscription?.features?.max_users;
  const memberLimit = maxUsersFeature?.quota_limit ?? getMemberLimit(subscription, 'free');
  ```

#### Fix 2: Database Feature Creation
- **Function**: `ensure_tenant_features`
- **Fix**: Now creates `max_users` feature with correct limits per plan:
  - Free: 5 users
  - Starter: 20 users
  - Pro: 50 users
  - Enterprise: unlimited (null)
- **Backfill**: Executed for all existing tenants

#### Fix 3: Visual Feedback
- **File**: `src/pages/admin/Members.tsx`
- **Changes**:
  1. "Convidar Membro" button disabled when limit reached
  2. Warning card displayed when at limit
  3. "Fazer Upgrade" button to navigate to plan upgrade
  4. Badge showing current/max members

## Validation Tests

### Test 1: Super Admin Escalation Prevention

**Objective**: Verify admins cannot become super_admin

**Steps**:
1. Login as regular admin (`admin@cybershield.test`)
2. Navigate to `/admin/users` or `/admin/members`
3. Attempt to change any user role to `super_admin`

**Expected Results**:
- ✅ `super_admin` option NOT visible in role dropdown
- ✅ Direct API call returns 403 with error: "Cannot assign super_admin role"
- ✅ RPC call fails with: "Cannot assign super_admin role through this function"

**Test Command**:
```bash
npm run test:e2e -- super-admin-privilege-escalation.spec.ts
```

### Test 2: Super Admin Modification Prevention

**Objective**: Verify existing super_admins cannot be demoted

**Steps**:
1. Login as regular admin
2. Attempt to change a super_admin user's role to admin/operator/viewer

**Expected Results**:
- ✅ Role selector is disabled for super_admin users
- ✅ Direct API call returns error: "Cannot modify super_admin role"
- ✅ RPC call fails with exception

**Manual Test**:
```sql
-- This should fail
SELECT update_user_role_rpc('super-admin-user-id', 'admin');
-- Error: Cannot modify super_admin role. Contact system administrator.
```

### Test 3: Member Limit Enforcement

**Objective**: Verify member limits are correctly enforced per plan

**Steps**:
1. Login as admin with **Free plan** (limit: 5 members)
2. Navigate to `/admin/members`
3. Check member count display
4. If at limit, verify "Convidar Membro" button is disabled
5. Verify warning card is shown

**Expected Results**:
- ✅ Displays: "5 / 5" (or current/limit)
- ✅ "Limite atingido" badge visible
- ✅ "Convidar Membro" button is disabled
- ✅ Warning card with "Fazer Upgrade" button displayed
- ✅ Clicking "Fazer Upgrade" navigates to `/admin/plan-upgrade`

**Database Check**:
```sql
-- Verify max_users feature exists for all tenants
SELECT t.name, ts.status, sp.name as plan_name, 
       tf.quota_limit as max_users_limit, 
       tf.quota_used as current_users
FROM tenants t
JOIN tenant_subscriptions ts ON t.id = ts.tenant_id
JOIN subscription_plans sp ON ts.plan_id = sp.id
LEFT JOIN tenant_features tf ON t.id = tf.tenant_id AND tf.feature_key = 'max_users'
ORDER BY t.name;
```

### Test 4: Plan Limits Verification

**Objective**: Verify each plan has correct max_users limit

**Database Check**:
```sql
-- Free plan tenants should have max_users = 5
SELECT t.name, sp.name as plan, tf.quota_limit as max_users
FROM tenants t
JOIN tenant_subscriptions ts ON t.id = ts.tenant_id
JOIN subscription_plans sp ON ts.plan_id = sp.id
JOIN tenant_features tf ON t.id = tf.tenant_id AND tf.feature_key = 'max_users'
WHERE sp.name = 'free'
ORDER BY t.name;

-- Starter plan tenants should have max_users = 20
-- Pro plan tenants should have max_users = 50
-- Enterprise plan tenants should have max_users = NULL (unlimited)
```

## Regression Tests

### Test 5: Admin Can Still Update Regular Roles

**Objective**: Verify fix didn't break normal role updates

**Steps**:
1. Login as admin
2. Change a viewer to operator
3. Change an operator to admin
4. Change an admin to operator

**Expected Results**:
- ✅ All role changes succeed (except super_admin)
- ✅ UI updates immediately
- ✅ Toast confirmation displayed
- ✅ Audit log created for each change

### Test 6: Invite Flow Still Works

**Objective**: Verify member limits don't break invite flow

**Steps**:
1. Login as admin with available slots (e.g., 2/5 members)
2. Navigate to `/admin/invites`
3. Send invite to new email
4. Accept invite and verify user is added

**Expected Results**:
- ✅ Invite sent successfully
- ✅ New member added
- ✅ Member count increments (3/5)
- ✅ When limit reached, invite button disabled

## Security Monitoring

### Audit Logs to Monitor

After fixes, monitor these audit log entries:

```sql
-- Failed super_admin escalation attempts
SELECT * FROM audit_logs
WHERE action = 'update_role'
  AND success = false
  AND details->>'attempted_role' = 'super_admin'
ORDER BY created_at DESC;

-- Successful role updates (should show blocked_super_admin_escalation = true)
SELECT * FROM audit_logs
WHERE action = 'update_role'
  AND success = true
  AND details->>'blocked_super_admin_escalation' = 'true'
ORDER BY created_at DESC;
```

### Security Logs to Monitor

```sql
-- Privilege escalation attempts
SELECT * FROM security_logs
WHERE attack_type = 'privilege_escalation'
  AND blocked = true
ORDER BY created_at DESC;
```

## Known Limitations

1. **super_admin assignment requires direct SQL**:
   - Only database administrators can assign super_admin via SQL console
   - No UI or API endpoint supports super_admin assignment
   - This is **intentional** for maximum security

2. **super_admin users cannot be modified via UI**:
   - Role selector is disabled for super_admin users
   - Remove button is disabled for super_admin users
   - This prevents accidental demotion

3. **Member limit is soft cap**:
   - UI blocks new invites when limit reached
   - Database doesn't enforce hard constraint
   - Allows grace period for admins to upgrade before removing users

## Production Deployment Checklist

Before deploying these fixes to production:

- [ ] All database migrations executed successfully
- [ ] E2E tests pass (`super-admin-privilege-escalation.spec.ts`)
- [ ] Manual testing completed (all tests above)
- [ ] Security monitoring configured for:
  - [ ] Failed super_admin escalation attempts
  - [ ] Member limit violations
  - [ ] super_admin login events
- [ ] Documentation updated:
  - [ ] `docs/SUPER_ADMIN_SECURITY.md`
  - [ ] `supabase/functions/_shared/REQUIRE_SUPER_ADMIN_USAGE.md`
- [ ] Security team briefed on changes
- [ ] Incident response plan updated

## Rollback Plan

If issues are discovered in production:

### Rollback Step 1: Database
```sql
-- Revert update_user_role_rpc to previous version (allows super_admin assignment)
-- WARNING: This weakens security!
CREATE OR REPLACE FUNCTION public.update_user_role_rpc(p_user_id uuid, p_new_role app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- [Previous implementation without super_admin blocks]
$$;
```

### Rollback Step 2: Frontend
```typescript
// Re-add super_admin to role selectors if needed
// Files: MemberCard.tsx, Users.tsx
{ value: 'super_admin', label: 'Super Admin' }
```

### Rollback Step 3: Edge Function
```typescript
// Remove super_admin block from Zod schema
roles: z.array(z.enum(['admin', 'operator', 'viewer', 'super_admin']))
```

## Additional Security Enhancements (Future)

These were not implemented in this fix but should be considered:

1. **MFA for super_admin**:
   - Require multi-factor authentication for all super_admin logins
   - Implement time-based OTP or hardware keys

2. **IP Whitelist for super_admin**:
   - Restrict super_admin access to specific IP ranges
   - Log all super_admin access attempts with IP

3. **Session Timeout for super_admin**:
   - Shorter session duration (e.g., 15 minutes)
   - Require re-authentication for sensitive operations

4. **Approval Workflow for super_admin**:
   - Require approval from another super_admin
   - Implement time-delayed activation (e.g., 24 hours)

5. **Audit Alerts**:
   - Real-time Slack/email alerts for super_admin operations
   - Daily security reports of role changes

## Related Documentation

- Security Architecture: `docs/SECURITY_ARCHITECTURE.md`
- Super Admin Security: `docs/SUPER_ADMIN_SECURITY.md`
- Middleware Usage: `supabase/functions/_shared/REQUIRE_SUPER_ADMIN_USAGE.md`
- E2E Tests: `e2e/super-admin-privilege-escalation.spec.ts`
- Test Guide: `e2e/README-super-admin-tests.md`

## Support

If you encounter issues with these fixes:

1. Check the audit logs for error details
2. Review security logs for blocked attempts
3. Verify database migrations were applied successfully
4. Run E2E tests to identify specific failure points
5. Contact security team with logs and reproduction steps
