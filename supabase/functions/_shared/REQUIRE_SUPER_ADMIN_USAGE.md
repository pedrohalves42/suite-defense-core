# requireSuperAdmin Middleware - Usage Guide

## CRITICAL SECURITY GUIDELINE

The `requireSuperAdmin` middleware provides server-side validation that the authenticated user has the `super_admin` role. This is a **CRITICAL SECURITY CONTROL** that prevents privilege escalation attacks.

## When to Use

Use `requireSuperAdmin` for Edge Functions that meet **ALL** of these criteria:

1. **Exclusive to super_admin**: Only super_admin users should be able to call this function
2. **Cross-tenant operations**: The function accesses data from multiple tenants simultaneously
3. **Global modifications**: The function modifies system-wide configurations or settings

### Examples of Functions That MUST Use This Middleware:

- `list-all-users-admin`: Lists users from ALL tenants (cross-tenant read)
- Any future `/super-admin/*` routes that manage global system settings
- Functions that modify `subscription_plans` table (affects all tenants)
- Functions that access `audit_logs` across all tenants for security monitoring

## When NOT to Use

Do NOT use `requireSuperAdmin` if:

1. **Admin can access their tenant data**: Regular admins should see their own tenant's data
   - Example: `subscription-analytics` allows admin to see their tenant stats, super_admin sees all
   - Solution: Use inline role check with tenant filtering

2. **Public or API key authenticated**: Function uses API key authentication instead of JWT
   - Example: `api-tenant-features`, `api-tenant-info`, `api-tenant-stats`
   - Solution: These already use `authenticateApiKey` from `api-auth.ts`

3. **Agent-specific functions**: Functions called by agents with agent tokens
   - Example: `enroll-agent`, `heartbeat`, `poll-jobs`, `ack-job`
   - Solution: Use agent-specific authentication

## Implementation

### Correct Usage:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { requireSuperAdmin } from '../_shared/require-super-admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    // CRITICAL SECURITY: Validate super_admin role
    const authResult = await requireSuperAdmin(req, requestId);
    if (!authResult.success) {
      return authResult.response!;
    }

    // authResult.userId contains the authenticated super_admin user ID
    console.log(`[${requestId}] Super admin ${authResult.userId} executing function`);

    // Continue with function logic...
    // At this point, we KNOW the user is super_admin
  } catch (error) {
    // Error handling...
  }
});
```

### Alternative for Admin + Super Admin Functions:

For functions where both `admin` (tenant-scoped) and `super_admin` (global) can access:

```typescript
// Check roles inline with tenant filtering
const { data: roles, error: rolesError } = await supabase
  .from('user_roles')
  .select('role, tenant_id')
  .eq('user_id', userData.user.id)
  .in('role', ['admin', 'super_admin']);

if (rolesError || !roles || roles.length === 0) {
  throw new Error("Forbidden: Admin access required");
}

const isSuperAdmin = roles.some(r => r.role === 'super_admin');
const tenantId = isSuperAdmin ? null : roles[0].tenant_id;

// Apply tenant filtering for non-super_admin
if (!isSuperAdmin && tenantId) {
  query = query.eq('tenant_id', tenantId);
}
```

## Security Implications

### Without this middleware:
- ❌ Client-side role checks in React can be bypassed via browser DevTools
- ❌ Attackers can craft direct HTTP requests to Edge Functions
- ❌ Regular admins could access other tenants' data
- ❌ Privilege escalation attacks are possible

### With this middleware:
- ✅ Server-side validation using RPC function `is_super_admin` (bypasses RLS)
- ✅ Cannot be bypassed by manipulating frontend code
- ✅ Clear audit trail of who accessed super_admin functions
- ✅ Consistent security pattern across all critical endpoints

## Testing

Always create E2E tests for functions using `requireSuperAdmin`:

```typescript
test('super_admin can access global endpoint', async ({ page }) => {
  // Login as super_admin
  await loginAsSuperAdmin(page);
  
  // Should succeed
  const response = await callEdgeFunction('function-name');
  expect(response.status).toBe(200);
});

test('regular admin cannot access global endpoint', async ({ page }) => {
  // Login as regular admin
  await loginAsAdmin(page);
  
  // Should return 403 Forbidden
  const response = await callEdgeFunction('function-name');
  expect(response.status).toBe(403);
  expect(response.data.error).toContain('Super Admin privileges required');
});

test('unauthenticated user cannot access global endpoint', async ({ page }) => {
  // No login
  
  // Should return 401 Unauthorized
  const response = await callEdgeFunction('function-name');
  expect(response.status).toBe(401);
});
```

## Monitoring & Alerting

Functions using `requireSuperAdmin` should be monitored for:

1. **Access attempts by non-super_admin users** (403 responses)
   - Alert if > 5 attempts in 1 hour from same user
   - Potential privilege escalation attack

2. **Failed authentication attempts** (401 responses)
   - Alert if > 10 attempts in 1 hour
   - Potential brute force attack

3. **Successful super_admin operations**
   - Log all operations for audit trail
   - Include: user_id, function_name, timestamp, IP address

## Audit Logging

Always log super_admin operations:

```typescript
await supabase.from('audit_logs').insert({
  tenant_id: 'global', // Use 'global' for super_admin operations
  user_id: authResult.userId,
  action: 'list_all_users',
  resource_type: 'user',
  resource_id: null,
  success: true,
  details: {
    function: 'list-all-users-admin',
    request_id: requestId,
    ip_address: req.headers.get('x-forwarded-for'),
  },
});
```

## Checklist Before Production

- [ ] Function uses `requireSuperAdmin` middleware
- [ ] E2E tests cover super_admin access (200)
- [ ] E2E tests cover admin access denial (403)
- [ ] E2E tests cover unauthenticated access denial (401)
- [ ] Audit logging is implemented
- [ ] Security monitoring alerts are configured
- [ ] Function is documented in this file's "Functions Using This Middleware" section

## Functions Currently Using This Middleware

1. **list-all-users-admin**
   - Purpose: Lists all users from all tenants for super_admin dashboard
   - Justification: Cross-tenant read operation, exclusive to super_admin

## Related Documentation

- Security Architecture: `docs/SECURITY_ARCHITECTURE.md`
- RBAC Guidelines: `docs/RLS_BEST_PRACTICES.md`
- Testing Guide: `e2e/README-super-admin-tests.md`
