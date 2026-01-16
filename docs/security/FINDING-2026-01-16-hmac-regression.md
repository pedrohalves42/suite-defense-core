# Security Finding: hmac_secret Regression in active_agents View

## Severity: CRITICAL

## Date Discovered: 2026-01-16

## Status: RESOLVED ✓

---

## Summary

During a routine security audit, Dr. Vellum identified that the `hmac_secret` column was accidentally reintroduced into the `public.active_agents` view. This critical security regression would have exposed cryptographic secrets used for agent authentication to any authenticated frontend user.

## Root Cause

Migration `20260116002515_2b24b825-f8b5-4dcc-80bc-60130c099415` was created to fix missing columns in the `active_agents` view, but incorrectly included `hmac_secret` in the SELECT clause:

```sql
-- PROBLEMATIC MIGRATION (excerpt)
SELECT 
  ...
  hmac_secret  -- THIS SHOULD NEVER BE HERE
FROM public.agents
```

## Impact Assessment

| Category | Impact |
|----------|--------|
| Data Exposure | HIGH - HMAC secrets used for agent authentication would be queryable |
| Attack Vector | Authenticated users could extract secrets via Supabase client |
| Blast Radius | All agents in tenant (potentially cross-tenant if RLS bypassed) |
| Exploitation Difficulty | LOW - Simple `.from('active_agents').select('hmac_secret')` |

## Timeline

| Time | Event |
|------|-------|
| 2026-01-16 08:xx | Migration 20260116002515 applied (introduced regression) |
| 2026-01-16 09:12 | Security audit flagged hmac_secret in view definition |
| 2026-01-16 09:12 | Fix migration approved and applied |
| 2026-01-16 09:xx | Phase 3 hardening: Frontend updated to use Edge Functions |

## Remediation Actions

### Immediate Fix (Completed)
1. ✓ Created new migration to DROP and recreate `active_agents` view WITHOUT `hmac_secret`
2. ✓ Verified `security_invoker = on` is set on all critical views
3. ✓ Confirmed no sensitive columns exposed in any public view

### Phase 3 Hardening (Completed)
1. ✓ Created `validate-invite` Edge Function for secure token validation
2. ✓ Updated `AcceptInvite.tsx` to use Edge Function instead of direct table query
3. ✓ Removed direct access to `invites` table from frontend

### Phase 4 Prevention (Completed)
1. ✓ Created `tools/tests/assert_hmac_not_in_views.sql` CI gate
2. ✓ Test blocks any migration that exposes `hmac_secret` in views
3. ✓ Test verifies `security_invoker` on critical views

## Lessons Learned

1. **Always review view definitions for sensitive columns** when modifying views
2. **CI gates are essential** for security-critical invariants
3. **Edge Functions should be the only access path** for sensitive data
4. **security_invoker must be verified** on all views that filter by tenant

## Prevention Measures

The following CI checks now prevent this class of regression:

```sql
-- tools/tests/assert_hmac_not_in_views.sql
-- Fails if hmac_secret appears in any public view
-- Fails if token appears in invite views
-- Warns if security_invoker is missing from critical views
```

## References

- [ADR-023: RLS Hardening](../architecture/ADR-023-rls-hardening.md)
- [SECURITY_ARCHITECTURE.md](../SECURITY_ARCHITECTURE.md)
- [INV-002: HMAC Authentication](../SECURITY_INVARIANTS.md)

---

**Auditor**: Dr. Vellum (AI Security Agent)
**Reviewer**: System Administrator
**Classification**: INTERNAL - Security Finding
