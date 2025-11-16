# Super Admin Security Implementation

## Overview

The `super_admin` role in CyberShield provides **global system access** across all tenants. This is the highest privilege level and requires extreme security controls to prevent privilege escalation attacks.

## Security Principles

### 1. Defense in Depth

Super admin security uses **three layers of protection**:

1. **Frontend (React)**
   - `useSuperAdmin` hook validates role client-side
   - `SuperAdminLayout` component protects routes
   - Visual indicators (badges, navigation items)
   - **Purpose**: User experience only - NOT a security control

2. **Edge Functions (Backend)**
   - `requireSuperAdmin` middleware validates role server-side
   - Uses `is_super_admin` RPC to bypass RLS
   - **Purpose**: Primary security control - CANNOT be bypassed

3. **Database (RLS + RPC)**
   - `is_super_admin(_user_id)` RPC with SECURITY DEFINER
   - Direct table access to `user_roles` without RLS
   - **Purpose**: Final enforcement layer

### 2. Never Trust the Client

**CRITICAL**: Frontend validation is for UX only. All security decisions happen in the backend.

```typescript
// ❌ WRONG: Client-side only
if (useSuperAdmin().isSuperAdmin) {
  // Show sensitive data
}

// ✅ CORRECT: Backend validated
const response = await callEdgeFunction('list-all-users-admin'); // Middleware validates server-side
```

## Implementation Guide

### Step 1: Identify Super Admin Functions

Functions that need `super_admin` validation:

- [ ] Access data from **multiple tenants** simultaneously
- [ ] Modify **global configurations** (subscription plans, system settings)
- [ ] Perform **system-wide operations** (cleanup, migrations, analytics)
- [ ] Are under `/super-admin/*` routes

### Step 2: Apply Backend Middleware

```typescript
// supabase/functions/your-function/index.ts
import { requireSuperAdmin } from '../_shared/require-super-admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  // CRITICAL SECURITY: Validate super_admin
  const authResult = await requireSuperAdmin(req, requestId);
  if (!authResult.success) {
    return authResult.response!;
  }

  // Function logic - user is verified super_admin
});
```

### Step 3: Frontend Protection (UX)

```typescript
// src/pages/admin/super/YourPage.tsx
import { SuperAdminLayout } from '@/components/SuperAdminLayout';

export default function YourPage() {
  return (
    <SuperAdminLayout>
      {/* Your super admin content */}
    </SuperAdminLayout>
  );
}
```

### Step 4: Add to Router

```typescript
// src/App.tsx
<Route path="/super-admin" element={<SuperAdminLayout />}>
  <Route path="your-page" element={<YourPage />} />
</Route>
```

## Attack Vectors & Mitigations

### Attack 1: Direct API Call

**Attack**: User crafts HTTP request to Edge Function without going through React app

```bash
curl -X POST https://project.supabase.co/functions/v1/list-all-users-admin \
  -H "Authorization: Bearer <regular_admin_jwt>"
```

**Mitigation**: `requireSuperAdmin` middleware validates JWT and checks role server-side

```typescript
// Inside requireSuperAdmin
const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', {
  _user_id: user.id
});

if (!isSuperAdmin) {
  return 403; // Blocked
}
```

### Attack 2: Frontend Role Manipulation

**Attack**: User modifies React state/localStorage to appear as super_admin

```javascript
// In browser console
localStorage.setItem('role', 'super_admin');
```

**Mitigation**: Frontend checks are for UX only. Backend middleware still validates.

```typescript
// Frontend shows UI, but backend call fails
const response = await callEdgeFunction('list-all-users-admin');
// Returns 403 if not actually super_admin
```

### Attack 3: JWT Token Manipulation

**Attack**: User tries to modify JWT payload to add super_admin role

```javascript
// Attempt to forge JWT with super_admin claim
const fakeJWT = base64(header) + '.' + base64({ role: 'super_admin' }) + '.signature';
```

**Mitigation**: JWT signature verification + RPC check against database

```typescript
// 1. Supabase validates JWT signature (fails if tampered)
const { user } = await supabase.auth.getUser(token);

// 2. RPC queries actual role from database
const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', {
  _user_id: user.id
});
```

### Attack 4: RLS Bypass Attempt

**Attack**: User tries to directly query `user_roles` table to promote themselves

```sql
UPDATE user_roles SET role = 'super_admin' WHERE user_id = 'attacker_id';
```

**Mitigation**: RLS policies prevent users from modifying their own roles

```sql
-- From RLS policy
CREATE POLICY "Users cannot update their own roles"
ON user_roles FOR UPDATE
USING (false); -- No direct updates allowed

-- Only via RPC with admin validation
CREATE FUNCTION update_user_role_rpc(...) SECURITY DEFINER;
```

### Attack 5: SQL Injection

**Attack**: User provides malicious input to Edge Function

```javascript
const payload = {
  user_id: "'; DROP TABLE user_roles; --"
};
```

**Mitigation**: Parameterized queries via Supabase client (auto-escaping)

```typescript
// ✅ CORRECT: Supabase client auto-escapes
await supabase.rpc('is_super_admin', {
  _user_id: userId // Safely parameterized
});

// ❌ NEVER: Raw SQL
await supabase.query(`SELECT * FROM user_roles WHERE user_id = '${userId}'`);
```

## Common Mistakes

### ❌ Mistake 1: Client-side Only Check

```typescript
// WRONG: No backend validation
const { isSuperAdmin } = useSuperAdmin();
if (isSuperAdmin) {
  const allUsers = await supabase.from('users').select('*'); // RLS might allow
}
```

**Fix**: Call Edge Function with backend validation

```typescript
// CORRECT: Backend validates
const allUsers = await callEdgeFunction('list-all-users-admin');
```

### ❌ Mistake 2: Inline Role Check Without RPC

```typescript
// WRONG: RLS applies, might be recursive
const { data: roles } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', userId);

if (roles[0].role === 'super_admin') {
  // Allow access
}
```

**Fix**: Use RPC with SECURITY DEFINER

```typescript
// CORRECT: Bypasses RLS
const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', {
  _user_id: userId
});
```

### ❌ Mistake 3: Hardcoded Super Admin

```typescript
// WRONG: Hardcoded user IDs
const SUPER_ADMINS = ['user-id-1', 'user-id-2'];
if (SUPER_ADMINS.includes(userId)) {
  // Allow access
}
```

**Fix**: Always check database

```typescript
// CORRECT: Database is source of truth
const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', {
  _user_id: userId
});
```

## Testing Requirements

Every function using `requireSuperAdmin` MUST have:

### 1. E2E Test: Super Admin Access (200)

```typescript
test('super_admin can list all users', async ({ page }) => {
  await loginAsSuperAdmin(page);
  
  const response = await page.evaluate(async () => {
    const { data } = await supabase.functions.invoke('list-all-users-admin');
    return data;
  });

  expect(response).toBeDefined();
  expect(response.length).toBeGreaterThan(0);
});
```

### 2. E2E Test: Admin Access Denied (403)

```typescript
test('regular admin cannot list all users', async ({ page }) => {
  await loginAsAdmin(page); // Regular admin, not super_admin
  
  const response = await page.evaluate(async () => {
    try {
      await supabase.functions.invoke('list-all-users-admin');
    } catch (error) {
      return error;
    }
  });

  expect(response.message).toContain('Super Admin privileges required');
});
```

### 3. E2E Test: Unauthenticated Access Denied (401)

```typescript
test('unauthenticated user cannot list all users', async ({ page }) => {
  // No login
  
  const response = await page.evaluate(async () => {
    try {
      await supabase.functions.invoke('list-all-users-admin');
    } catch (error) {
      return error;
    }
  });

  expect(response.message).toContain('Unauthorized');
});
```

### 4. E2E Test: Privilege Escalation Prevention

```typescript
test('admin cannot promote themselves to super_admin', async ({ page }) => {
  await loginAsAdmin(page);
  
  const response = await page.evaluate(async () => {
    try {
      // Attempt to change own role
      await supabase.functions.invoke('update-user-role', {
        body: {
          userId: 'self',
          role: 'super_admin'
        }
      });
    } catch (error) {
      return error;
    }
  });

  expect(response.message).toContain('Cannot change your own role');
});
```

## Monitoring & Alerts

### Metrics to Track

1. **Super Admin Login Events**
   - Who: user_id
   - When: timestamp
   - From: IP address
   - Alert: Email to security team on every super_admin login

2. **Failed Super Admin Access Attempts**
   - Who: user_id (attempted)
   - What: function_name
   - Result: 403 Forbidden
   - Alert: After 3 attempts in 1 hour

3. **Super Admin Operations**
   - Who: super_admin user_id
   - What: function_name
   - When: timestamp
   - Changes: details JSON
   - Alert: Real-time Slack notification for critical operations

### Implementation

```typescript
// After successful super_admin validation
await supabase.from('audit_logs').insert({
  tenant_id: 'global',
  user_id: authResult.userId,
  action: 'super_admin_access',
  resource_type: 'function',
  resource_id: 'list-all-users-admin',
  success: true,
  details: {
    request_id: requestId,
    ip_address: req.headers.get('x-forwarded-for'),
    user_agent: req.headers.get('user-agent'),
  },
});

// After failed super_admin validation
await supabase.from('security_logs').insert({
  tenant_id: attemptedUser.tenant_id,
  user_id: attemptedUser.id,
  attack_type: 'privilege_escalation',
  endpoint: '/functions/v1/list-all-users-admin',
  blocked: true,
  severity: 'high',
  details: {
    attempted_role: 'super_admin',
    actual_role: attemptedUser.role,
  },
});
```

## Rollout Checklist

Before deploying super_admin changes to production:

- [ ] All critical Edge Functions have `requireSuperAdmin` middleware
- [ ] All super_admin routes in frontend use `SuperAdminLayout`
- [ ] E2E tests pass for all super_admin functions (200, 403, 401, escalation)
- [ ] Audit logging is implemented for all super_admin operations
- [ ] Monitoring alerts are configured (failed access, logins, operations)
- [ ] Security team has been briefed on super_admin functionality
- [ ] Incident response plan exists for compromised super_admin account
- [ ] At least 2 super_admin users exist (no single point of failure)
- [ ] Super admin credentials are stored in password manager (1Password, LastPass)

## Related Files

- Middleware: `supabase/functions/_shared/require-super-admin.ts`
- Frontend Layout: `src/components/SuperAdminLayout.tsx`
- Frontend Hook: `src/hooks/useSuperAdmin.tsx`
- RPC Function: `supabase/migrations/*_create_is_super_admin_rpc.sql`
- E2E Tests: `e2e/super-admin-tenant-management.spec.ts`
- Usage Guide: `supabase/functions/_shared/REQUIRE_SUPER_ADMIN_USAGE.md`
