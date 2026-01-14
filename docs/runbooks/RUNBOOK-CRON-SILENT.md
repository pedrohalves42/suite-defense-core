# Runbook: Cron Job Silence

**Severity**: Medium-High  
**MTTR Target**: < 30 minutes  
**Escalation**: After 2x expected interval without execution

---

## Symptoms

- Scheduled jobs not running
- `v_cron_silence` showing entries
- Stale data in reports/metrics
- Missing heartbeats in `scheduled_job_heartbeat`

---

## Quick Diagnosis

### 1. Check Cron Silence View

```sql
SELECT * FROM v_cron_silence;
```

This shows jobs that haven't run for 2x their expected interval.

### 2. Check Job Heartbeats

```sql
SELECT 
  job_key,
  last_seen_at,
  expected_interval,
  NOW() - last_seen_at AS silence_duration,
  CASE 
    WHEN NOW() - last_seen_at > expected_interval * 2 THEN 'CRITICAL'
    WHEN NOW() - last_seen_at > expected_interval THEN 'WARNING'
    ELSE 'OK'
  END AS status
FROM scheduled_job_heartbeat
ORDER BY last_seen_at ASC;
```

### 3. Check Edge Function Invocation Logs

```sql
-- Check if cron scheduler is invoking functions
SELECT 
  timestamp,
  event_message,
  metadata
FROM edge_logs
WHERE function_id = 'your-job-function-id'
ORDER BY timestamp DESC
LIMIT 20;
```

---

## Common Causes

### A. Emergency Mode Active

**Symptom**: All jobs stopped simultaneously

**Check**:
```sql
SELECT * FROM get_system_mode_safe();
```

**Fix**: See [RUNBOOK-EMERGENCY-MODE.md](./RUNBOOK-EMERGENCY-MODE.md)

### B. Edge Function Deployment Failure

**Symptom**: Specific function not running

**Check**:
```bash
npx supabase functions list
```

**Fix**:
```bash
npx supabase functions deploy function-name
```

### C. Database Connection Exhaustion

**Symptom**: Functions timeout or fail with connection errors

**Check**:
```sql
SELECT count(*) FROM pg_stat_activity 
WHERE state = 'active';
```

**Fix**:
1. Kill idle connections
2. Review connection pooling settings
3. Optimize long-running queries

### D. Supabase Scheduler Issue

**Symptom**: No invocations in Edge logs

**Check**: Supabase dashboard → Edge Functions → Schedules

**Fix**:
1. Verify cron schedule is configured
2. Re-enable if disabled
3. Contact Supabase support if persistent

### E. Function Error Loop

**Symptom**: Function runs but fails immediately

**Check**:
```bash
npx supabase functions logs function-name --tail
```

**Fix**: Debug and fix function code

---

## Recovery Procedure

### Immediate (< 10 min)

1. **Identify which jobs are silent**
   ```sql
   SELECT * FROM v_cron_silence ORDER BY silence_duration DESC;
   ```

2. **Check system mode**
   ```sql
   SELECT * FROM get_system_mode_safe();
   ```

3. **Manual trigger if critical**
   ```bash
   curl -X POST "${SUPABASE_URL}/functions/v1/job-name" \
     -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
   ```

### Investigation (< 20 min)

1. **Review function logs**
   ```bash
   npx supabase functions logs job-name --tail 100
   ```

2. **Check for errors in last runs**
   ```sql
   SELECT * FROM scheduled_jobs
   WHERE job_type = 'job_name'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

3. **Verify dependencies**
   - Database tables exist
   - Required secrets configured
   - External APIs reachable

### Fix & Verify

1. **Apply fix** (redeploy, fix config, etc.)

2. **Manual trigger to verify**

3. **Update heartbeat**
   ```sql
   SELECT update_job_heartbeat('job_name', '5 minutes'::interval);
   ```

4. **Monitor next scheduled run**

---

## Job Heartbeat Setup

### Adding Heartbeat to New Jobs

Every scheduled job should call `update_job_heartbeat` at the end:

```typescript
// In Edge Function
await supabase.rpc('update_job_heartbeat', {
  p_job_key: 'my-job-name',
  p_expected_interval: '10 minutes'
});
```

### Expected Intervals

| Job | Expected Interval |
|-----|------------------|
| `security-alert-dispatcher` | 5 minutes |
| `run-rls-tests` | 1 hour |
| `cleanup-jobs` | 6 hours |
| `generate-reports` | 24 hours |

---

## Monitoring

### Create Alert for Silent Jobs

```sql
-- Add to security-alert-dispatcher
INSERT INTO system_alerts (alert_type, severity, message, resolved)
SELECT 
  'cron_silence',
  'warning',
  'Job ' || job_key || ' silent for ' || silence_duration,
  false
FROM v_cron_silence
WHERE silence_duration > expected_interval * 2;
```

### Dashboard Query

```sql
SELECT 
  job_key,
  last_seen_at,
  expected_interval,
  ROUND(EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 60) AS minutes_since_last_run,
  CASE 
    WHEN NOW() - last_seen_at > expected_interval * 3 THEN '🔴 CRITICAL'
    WHEN NOW() - last_seen_at > expected_interval * 2 THEN '🟠 WARNING'
    WHEN NOW() - last_seen_at > expected_interval THEN '🟡 LATE'
    ELSE '🟢 OK'
  END AS health
FROM scheduled_job_heartbeat
ORDER BY 
  CASE WHEN NOW() - last_seen_at > expected_interval * 2 THEN 0 ELSE 1 END,
  last_seen_at ASC;
```

---

## Prevention

1. **Always add heartbeat calls to scheduled jobs**
2. **Monitor `v_cron_silence` in observability dashboard**
3. **Set up alerts for jobs 2x past expected interval**
4. **Document expected intervals in job code**

---

## Related Runbooks

- [RUNBOOK-EMERGENCY-MODE.md](./RUNBOOK-EMERGENCY-MODE.md)
- [RUNBOOK-EDGE-500.md](./RUNBOOK-EDGE-500.md)
