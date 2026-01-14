# Runbook: Emergency Mode (Kill Switch)

**Severity**: Critical  
**MTTR Target**: < 5 minutes (activation), < 15 minutes (full recovery)  
**Authority**: Requires Sr. Engineer or above

---

## Emergency Mode States

| State | Description | Behavior |
|-------|-------------|----------|
| `normal` | System operating normally | All features enabled |
| `restricted` | Limited operations | Non-critical features disabled |
| `emergency_stop` | Full emergency mode | All mutations blocked, read-only |

---

## When to Activate Emergency Mode

### Activate Immediately For:

- ❌ **Active security breach** (data exfiltration, unauthorized access)
- ❌ **Mass data corruption** (cascade deletes, wrong updates)
- ❌ **Runaway automation** (infinite loops, recursive triggers)
- ❌ **Critical infrastructure failure** (DB connection storms)

### Consider Activation For:

- ⚠️ **Sustained high error rates** (> 50% failures for 5+ min)
- ⚠️ **Unusual access patterns** (potential attack)
- ⚠️ **Degraded performance** affecting all users

---

## Activation Procedure

### Step 1: Activate Emergency Mode

```sql
-- CRITICAL: Run this to stop all mutations
UPDATE system_global_state 
SET 
  mode = 'emergency_stop',
  updated_at = NOW(),
  changed_by = 'OPERATOR_NAME - INCIDENT_ID'
WHERE id = (SELECT id FROM system_global_state LIMIT 1);
```

### Step 2: Verify Activation

```sql
SELECT * FROM is_emergency_mode();
-- Should return: true

SELECT * FROM get_system_mode_safe();
-- Should return: 'emergency_stop'
```

### Step 3: Notify Team

1. Post in #incidents Slack channel
2. Page on-call engineer if not already engaged
3. Log incident in system

### Step 4: Document in Audit Log

```sql
INSERT INTO audit_logs (event_type, actor_id, details, tenant_id)
VALUES (
  'emergency_mode_activated',
  'OPERATOR_USER_ID',
  jsonb_build_object(
    'reason', 'BRIEF_REASON',
    'incident_id', 'INCIDENT_ID',
    'activated_at', NOW()
  ),
  NULL  -- System-wide, no tenant
);
```

---

## What Happens in Emergency Mode

### Edge Functions

- Return HTTP 503 with `Retry-After: 300`
- Response includes `error: 'SYSTEM_EMERGENCY_MODE'`
- Health probe middleware blocks processing

### Scheduled Jobs

- `assert_system_allows_jobs()` throws exception
- Jobs abort before execution
- Logged to job failure table

### Database

- Write operations blocked by RLS policies (if configured)
- Read operations continue for monitoring
- Audit logs still writable

### UI

- Should display emergency banner
- Forms disabled
- Actions show "System in maintenance" message

---

## Recovery Procedure

### Pre-Recovery Checklist

- [ ] Root cause identified
- [ ] Fix deployed or issue mitigated
- [ ] No ongoing attack/corruption
- [ ] Team ready to monitor

### Step 1: Switch to Restricted Mode First

```sql
-- Don't go directly to normal - test with restricted first
UPDATE system_global_state 
SET 
  mode = 'restricted',
  updated_at = NOW(),
  changed_by = 'OPERATOR_NAME - RECOVERY'
WHERE id = (SELECT id FROM system_global_state LIMIT 1);
```

### Step 2: Verify Critical Functions

```bash
# Test key Edge Functions
curl -X POST "${SUPABASE_URL}/functions/v1/health" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"

# Should return 200, not 503
```

### Step 3: Switch to Normal Mode

```sql
UPDATE system_global_state 
SET 
  mode = 'normal',
  updated_at = NOW(),
  changed_by = 'OPERATOR_NAME - FULL_RECOVERY'
WHERE id = (SELECT id FROM system_global_state LIMIT 1);
```

### Step 4: Verify Full Recovery

```sql
SELECT * FROM is_emergency_mode();
-- Should return: false

SELECT * FROM get_system_mode_safe();
-- Should return: 'normal'
```

### Step 5: Document Recovery

```sql
INSERT INTO audit_logs (event_type, actor_id, details, tenant_id)
VALUES (
  'emergency_mode_deactivated',
  'OPERATOR_USER_ID',
  jsonb_build_object(
    'incident_id', 'INCIDENT_ID',
    'duration_minutes', EXTRACT(EPOCH FROM (NOW() - activation_time)) / 60,
    'root_cause', 'BRIEF_DESCRIPTION',
    'deactivated_at', NOW()
  ),
  NULL
);
```

---

## Monitoring During Emergency

### Key Queries

```sql
-- Check system alerts created during emergency
SELECT * FROM system_alerts 
WHERE created_at > 'ACTIVATION_TIMESTAMP'
ORDER BY created_at DESC;

-- Check failed operations
SELECT * FROM security_logs
WHERE severity = 'high' 
AND created_at > 'ACTIVATION_TIMESTAMP'
ORDER BY created_at DESC
LIMIT 100;

-- Check job failures
SELECT * FROM scheduled_jobs
WHERE status = 'failed'
AND updated_at > 'ACTIVATION_TIMESTAMP';
```

### Dashboard Items

- Edge Function error rates
- Database connection count
- API latency percentiles
- Active user sessions

---

## Post-Incident

### Required Actions

1. **Incident report** within 24 hours
2. **Post-mortem** for incidents > 15 minutes
3. **Update runbook** if new scenario discovered
4. **Add automated detection** if applicable

### Incident Report Template

```markdown
## Incident Summary
- **Date/Time**: 
- **Duration**: 
- **Impact**: 
- **Root Cause**: 

## Timeline
- HH:MM - Issue detected
- HH:MM - Emergency mode activated
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Normal mode restored

## What Went Well
- 

## What Could Improve
- 

## Action Items
- [ ] 
```

---

## Emergency Contacts

| Role | Contact Method |
|------|---------------|
| On-Call Engineer | PagerDuty |
| Security Team | #security Slack |
| Database Admin | #database Slack |
| Engineering Lead | Direct message |

---

## Related Runbooks

- [RUNBOOK-EDGE-500.md](./RUNBOOK-EDGE-500.md)
- [RUNBOOK-SCHEMA-DRIFT.md](./RUNBOOK-SCHEMA-DRIFT.md)
- [RUNBOOK-CRON-SILENT.md](./RUNBOOK-CRON-SILENT.md)
