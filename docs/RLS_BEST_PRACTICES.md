# Row Level Security (RLS) - Best Practices

## ⚠️ Critical Rule: Avoid Infinite Recursion

### ❌ NEVER DO THIS
**Do NOT make direct SELECT queries to `user_roles` inside RLS policies!**

```sql
-- ❌ WRONG - Causes infinite recursion (42P17 error)
CREATE POLICY "admins_can_view" ON some_table
FOR SELECT USING (
  (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'admin'
);
```

**Why it fails:**
1. User tries to read from `some_table`
2. RLS policy needs to check `user_roles`
3. Reading `user_roles` triggers ITS OWN RLS policies
4. Those policies try to read `user_roles` again
5. **Infinite loop → PostgreSQL error 42P17**

---

## ✅ CORRECT APPROACH

### Use Security Definer Functions

**Always use these pre-created functions:**

#### 1. `has_role(_user_id uuid, _role app_role)`
Check if a user has a specific role:

```sql
-- ✅ CORRECT
CREATE POLICY "admins_can_view" ON some_table
FOR SELECT USING (
  has_role(auth.uid(), 'admin')
);
```

#### 2. `is_super_admin(_user_id uuid)`
Check if a user is a super admin:

```sql
-- ✅ CORRECT
CREATE POLICY "super_admins_can_view_all" ON some_table
FOR SELECT USING (
  is_super_admin(auth.uid())
);
```

#### 3. `current_user_tenant_id()`
Get the user's tenant ID:

```sql
-- ✅ CORRECT
CREATE POLICY "users_can_view_own_tenant" ON some_table
FOR SELECT USING (
  tenant_id = current_user_tenant_id()
);
```

---

## 📋 Pre-Migration Checklist

Before creating any migration with RLS policies:

- [ ] Are you adding policies to `user_roles`, `tenants`, `audit_logs`, or `invites`?
- [ ] Do your policies use **only** `has_role()`, `is_super_admin()`, or `current_user_tenant_id()`?
- [ ] Did you avoid direct `SELECT` queries to `user_roles`?
- [ ] Did you test the policies with `EXPLAIN` to check for recursion?
- [ ] Did you add comments explaining the security logic?

---

## 🔍 Testing for Recursion

Use `EXPLAIN` to detect potential recursion before deploying:

```sql
-- Test if a query causes recursion
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM user_roles WHERE user_id = auth.uid();
```

If you see:
- **"infinite recursion detected"** → FIX IMMEDIATELY
- **"Seq Scan"** with high cost → Might be inefficient, but not recursive

---

## 📚 Examples of Correct RLS Policies

### Example 1: Tenant-specific data access
```sql
CREATE POLICY "users_can_view_tenant_data" ON agents
FOR SELECT USING (
  has_role(auth.uid(), 'admin') 
  AND tenant_id = current_user_tenant_id()
);
```

### Example 2: Super admin bypass
```sql
CREATE POLICY "super_admins_bypass" ON any_table
FOR ALL USING (
  is_super_admin(auth.uid())
);
```

### Example 3: Combined conditions
```sql
CREATE POLICY "admins_or_super_admins" ON some_table
FOR SELECT USING (
  (has_role(auth.uid(), 'admin') AND tenant_id = current_user_tenant_id())
  OR is_super_admin(auth.uid())
);
```

### Example 4: Users viewing their own data
```sql
CREATE POLICY "users_can_view_own_data" ON profiles
FOR SELECT USING (
  user_id = auth.uid()
);
```

---

## 🛠️ How Security Definer Functions Work

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER  -- 👈 This is the magic!
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
```

**Why `SECURITY DEFINER` works:**
- Function runs with **owner's privileges**, not caller's
- Bypasses RLS policies **only inside the function**
- Returns a **simple boolean** → no recursion possible

---

## 🚨 Common Mistakes

### Mistake 1: Mixing direct queries with function calls
```sql
-- ❌ WRONG - Still causes recursion!
CREATE POLICY "mixed_approach" ON some_table
FOR SELECT USING (
  has_role(auth.uid(), 'admin')
  OR (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer'
);
```

**Fix:** Use only function calls:
```sql
-- ✅ CORRECT
CREATE POLICY "correct_approach" ON some_table
FOR SELECT USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'viewer')
);
```

### Mistake 2: Creating new policies without security definer functions
```sql
-- ❌ WRONG - Reinventing the wheel
CREATE POLICY "custom_check" ON some_table
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'operator'
  )
);
```

**Fix:** Use the existing function:
```sql
-- ✅ CORRECT
CREATE POLICY "use_existing_function" ON some_table
FOR SELECT USING (
  has_role(auth.uid(), 'operator')
);
```

---

## 📖 Reference

### Available Security Definer Functions

| Function | Purpose | Example |
|----------|---------|---------|
| `has_role(_user_id uuid, _role app_role)` | Check specific role | `has_role(auth.uid(), 'admin')` |
| `is_super_admin(_user_id uuid)` | Check super admin | `is_super_admin(auth.uid())` |
| `current_user_tenant_id()` | Get user's tenant | `tenant_id = current_user_tenant_id()` |
| `is_operator_or_viewer(_user_id uuid)` | Check operator/viewer | `is_operator_or_viewer(auth.uid())` |

### Valid App Roles

```sql
CREATE TYPE app_role AS ENUM (
  'admin',
  'operator',
  'viewer',
  'super_admin'
);
```

---

## 🔐 Security Reminder

> **CRITICAL:** The `user_roles` table is the source of truth for all permissions.  
> **NEVER** allow direct manipulation through RLS policies.  
> **ALWAYS** use security definer functions to check permissions.

---

## 📞 Need Help?

If you encounter recursion errors:
1. Check if your policy uses direct `SELECT` from `user_roles`
2. Replace with `has_role()`, `is_super_admin()`, or `current_user_tenant_id()`
3. Test with `EXPLAIN` before deploying
4. Review this document for examples

---

## 🔄 Multiple Roles Handling

### Problem: Users with Multiple Roles

When a user has multiple roles (e.g., `admin` + `super_admin`), using `.single()` in queries to `user_roles` causes **PGRST116 errors**.

### Solution: Use Helper Functions in Edge Functions

```typescript
// ❌ WRONG - Fails with multiple roles
const { data: userRole } = await supabase
  .from('user_roles')
  .select('tenant_id')
  .eq('user_id', user.id)
  .single(); // 💥 Error if user has 2+ roles

// ✅ CORRECT - Use shared helper
import { getTenantIdForUser } from '../_shared/tenant.ts';

const tenantId = await getTenantIdForUser(supabase, user.id);
if (!tenantId) {
  throw new Error('Tenant not found');
}
```

### Solution: Use `useTenant()` Hook in React

```typescript
// ❌ WRONG - Direct query with .single()
const { data: userRole } = await supabase
  .from('user_roles')
  .select('tenant_id')
  .eq('user_id', user.id)
  .single();

// ✅ CORRECT - Use useTenant hook
import { useTenant } from '@/hooks/useTenant';

const { tenant, loading } = useTenant();

// Use tenant?.id in queries
const { data } = useQuery({
  queryKey: ['data', tenant?.id],
  queryFn: async () => { /* ... */ },
  enabled: !!tenant?.id,
});
```

### Available Helper Functions

| Function | Purpose | Location |
|----------|---------|----------|
| `getTenantIdForUser(supabase, userId)` | Get user's tenant ID | `_shared/tenant.ts` |
| `verifyUserTenant(supabase, userId, tenantId)` | Verify tenant membership | `_shared/tenant.ts` |

**See:** `docs/MULTIPLE_ROLES_HANDLING.md` for detailed guide.

---

**Last Updated:** 2025-01-17  
**Related Migration:** `fix_rls_infinite_recursion.sql`  
**Related Docs:** `MULTIPLE_ROLES_HANDLING.md`

