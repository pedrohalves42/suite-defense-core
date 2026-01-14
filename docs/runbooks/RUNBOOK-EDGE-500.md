# Runbook: Edge Function 500 Errors

**Severity**: High  
**MTTR Target**: < 15 minutes  
**Escalation**: After 3 consecutive failures from same function

---

## Symptoms

- Edge Function returning HTTP 500
- `Internal Server Error` in response body
- Error logs showing unhandled exceptions
- Client-side errors from API calls

---

## Quick Diagnosis

### 1. Check Edge Function Logs

```bash
# Via Supabase Dashboard or CLI
npx supabase functions logs <function-name> --tail
```

Look for:
- Stack traces
- "undefined" access errors
- Database connection failures
- Missing environment variables

### 2. Check System Mode

```sql
SELECT * FROM get_system_mode_safe();
```

If returns `emergency_stop`:
- See [RUNBOOK-EMERGENCY-MODE.md](./RUNBOOK-EMERGENCY-MODE.md)

### 3. Verify Environment Variables

Required for all functions:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

---

## Common Causes & Fixes

### A. Schema Drift

**Symptom**: `relation "X" does not exist` or `column "Y" does not exist`

**Root Cause**: Database schema changed but Edge Function expects old schema

**Fix**:
1. Check contract tests: `npm run test:contracts`
2. Review recent migrations
3. Align Edge Function with current schema
4. Redeploy function

### B. Missing RPC Function

**Symptom**: `function "X" does not exist`

**Fix**:
1. Verify RPC exists: `SELECT proname FROM pg_proc WHERE proname = 'function_name';`
2. If missing, run appropriate migration
3. If exists, check schema qualification (public. vs other)

### C. Service Role Key Issues

**Symptom**: `JWT expired`, `Invalid API key`

**Fix**:
1. Regenerate service role key in Supabase dashboard
2. Update in Edge Function environment
3. Redeploy function

### D. Rate Limiting

**Symptom**: Function fails intermittently

**Fix**:
1. Check `rate_limits` table for blocked entries
2. Review calling patterns
3. Implement exponential backoff in clients

### E. Memory/Timeout

**Symptom**: Function timeout or memory exceeded

**Fix**:
1. Optimize query performance
2. Add pagination for large datasets
3. Consider splitting into smaller functions

---

## Recovery Procedure

### Immediate (< 5 min)

1. **Identify affected function(s)**
   ```sql
   SELECT * FROM security_logs 
   WHERE severity IN ('high', 'critical')
   AND created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;
   ```

2. **Check if isolated or systemic**
   - Single function → Likely code issue
   - Multiple functions → Check database/infrastructure

3. **Rollback if recent deployment**
   ```bash
   # Redeploy previous version
   git checkout HEAD~1 -- supabase/functions/<function-name>
   npx supabase functions deploy <function-name>
   ```

### Short-term (< 15 min)

1. **Review error logs in detail**
2. **Apply targeted fix**
3. **Test in staging**
4. **Deploy fix**

### Post-Incident

1. **Document root cause**
2. **Add contract test if schema-related**
3. **Update monitoring thresholds if needed**
4. **Schedule post-mortem if significant**

---

## Monitoring

### Alerts to Check

- `system_alerts` with `alert_type = 'edge_function_failure'`
- `security_logs` with `endpoint LIKE '/functions/v1/%'`

### Key Metrics

- Error rate per function
- P95 latency
- Success rate over time

---

## Prevention

1. **Always run contract tests before deploying**
2. **Use health probe middleware in all critical functions**
3. **Implement proper error handling with context**
4. **Add logging at key decision points**

---

## Related Runbooks

- [RUNBOOK-SCHEMA-DRIFT.md](./RUNBOOK-SCHEMA-DRIFT.md)
- [RUNBOOK-EMERGENCY-MODE.md](./RUNBOOK-EMERGENCY-MODE.md)
