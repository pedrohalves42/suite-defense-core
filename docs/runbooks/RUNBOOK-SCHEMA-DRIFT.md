# Runbook: Schema Drift Detection

**Severity**: Critical  
**MTTR Target**: < 30 minutes  
**Escalation**: Immediate if production impacted

---

## Symptoms

- Contract tests failing in CI
- Edge Functions returning 500/503
- Error messages mentioning missing columns/tables
- `SCHEMA_DRIFT` in health probe responses

---

## Definition

**Schema Drift** occurs when:
- Edge Functions expect columns/tables that don't exist
- Database schema is modified without updating dependent code
- Migrations run in wrong order

---

## Quick Diagnosis

### 1. Run Contract Tests

```bash
cd contracts
npm install
npx playwright test
```

Failed tests indicate specific drift:
- `audit_logs.contract.ts` → audit_logs table issues
- `agents.contract.ts` → agents table issues

### 2. Check describe_table RPC

```sql
SELECT * FROM describe_table('affected_table_name');
```

Compare against expected schema in `contracts/schemas/`.

### 3. Review Recent Migrations

```sql
SELECT * FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 10;
```

---

## Common Drift Scenarios

### A. Missing Column

**Symptom**: `column "X" does not exist`

**Fix**:
```sql
ALTER TABLE table_name 
ADD COLUMN column_name data_type DEFAULT default_value;
```

### B. Column Type Mismatch

**Symptom**: Type casting errors or unexpected nulls

**Fix**:
```sql
ALTER TABLE table_name 
ALTER COLUMN column_name TYPE new_type USING column_name::new_type;
```

### C. Forbidden Column Still Exists

**Symptom**: Contract test fails on `forbiddenColumns`

**Fix**:
```sql
-- CAUTION: This deletes data
ALTER TABLE table_name DROP COLUMN column_name;

-- Safer: Rename to deprecated
ALTER TABLE table_name RENAME COLUMN column_name TO _deprecated_column_name;
```

### D. Missing Table

**Symptom**: `relation "X" does not exist`

**Fix**:
1. Review migration that should create table
2. Run missing migration
3. Verify with contract test

### E. Missing RPC/Function

**Symptom**: `function "X" does not exist`

**Fix**:
1. Check `docs/architecture/` for function definition
2. Run appropriate migration
3. Verify function exists:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'function_name';
   ```

---

## Recovery Procedure

### Immediate (< 10 min)

1. **Identify scope of drift**
   ```bash
   npx playwright test --reporter=list 2>&1 | grep -E "(FAIL|PASS)"
   ```

2. **Assess production impact**
   - Check Edge Function logs
   - Check `system_alerts` for recent failures

3. **If critical, activate emergency mode**
   ```sql
   UPDATE system_global_state 
   SET mode = 'restricted', 
       updated_at = NOW(),
       changed_by = 'runbook-schema-drift'
   WHERE id = (SELECT id FROM system_global_state LIMIT 1);
   ```

### Fix (< 20 min)

1. **Create migration to fix drift**
   ```sql
   -- Example: Add missing column
   ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
   ```

2. **Run migration in transaction**
   ```sql
   BEGIN;
   -- migration SQL here
   COMMIT;
   ```

3. **Verify fix**
   ```bash
   npx playwright test contracts/schemas/affected.contract.ts
   ```

### Restore (< 5 min)

1. **Redeploy affected Edge Functions**
   ```bash
   npx supabase functions deploy function-name
   ```

2. **Clear emergency mode if activated**
   ```sql
   UPDATE system_global_state 
   SET mode = 'normal', 
       updated_at = NOW(),
       changed_by = 'runbook-schema-drift-recovery'
   WHERE id = (SELECT id FROM system_global_state LIMIT 1);
   ```

3. **Verify recovery**
   - Check Edge Function responses
   - Verify no 503 errors

---

## Prevention

### 1. Always Run Contract Tests in CI

```yaml
- name: Contract Tests
  run: |
    cd contracts
    npm ci
    npx playwright test
```

### 2. Use Migration Tool for All Schema Changes

Never modify schema directly in production. Always use:
```bash
npx supabase migration new description_of_change
```

### 3. Update Contracts Before Migrations

1. Add new required columns to contract
2. Run test (should fail)
3. Create migration
4. Run test (should pass)
5. Merge PR

### 4. Document Edge ↔ DB Dependencies

See [ADR-027-edge-contracts.md](../architecture/ADR-027-edge-contracts.md)

---

## Contract Schema Reference

| Contract File | Table | Critical Columns |
|--------------|-------|------------------|
| `audit_logs.contract.ts` | audit_logs | id, event_type, actor_id, tenant_id |
| `system_alerts.contract.ts` | system_alerts | id, alert_type, severity, status |
| `agents.contract.ts` | agents | id, tenant_id, agent_name, status |
| `invites.contract.ts` | invites | id, email, tenant_id, status |

---

## Related Runbooks

- [RUNBOOK-EDGE-500.md](./RUNBOOK-EDGE-500.md)
- [RUNBOOK-EMERGENCY-MODE.md](./RUNBOOK-EMERGENCY-MODE.md)
