# System Diagnostics Guide

This guide provides comprehensive diagnostics tools and queries for troubleshooting the CyberShield system.

## Overview

The CyberShield system includes multiple diagnostic tools:

1. **SQL Diagnostic Queries** (`scripts/diagnostic-queries.sql`)
2. **System Health Dashboard** (UI at `/admin/system-health`)
3. **Performance Metrics Dashboard** (UI at `/admin/performance-metrics`)
4. **PowerShell Validation Script** (`scripts/verificar-installer-agente.ps1`)

## Quick Start

### For Immediate Issues

1. **Check System Health Dashboard**
   - Navigate to `/admin/system-health` in the UI
   - View real-time agent health, job status, and performance metrics
   - Identify stuck agents or degraded services

2. **Run SQL Diagnostics**
   - Open Supabase SQL Editor
   - Copy queries from `scripts/diagnostic-queries.sql`
   - Execute relevant queries for your issue

3. **Validate Agent Scripts**
   - Before any agent installation, run:
     ```powershell
     .\scripts\verificar-installer-agente.ps1 -ScriptPath "path\to\installer.ps1"
     ```

## Diagnostic Queries

### 1. Find Stuck Agents

**Symptom:** Agents in "pending" state with no heartbeat

**Query:**
```sql
SELECT 
  a.id,
  a.agent_name,
  a.status,
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) / 60 AS minutes_since_heartbeat
FROM public.agents a
WHERE 
  a.status = 'pending'
  AND (a.last_heartbeat IS NULL OR a.last_heartbeat < NOW() - INTERVAL '10 minutes')
ORDER BY a.enrolled_at DESC;
```

**Action:**
- Regenerate credentials for stuck agents
- Use cleanup script in `diagnostic-queries.sql` section 6

### 2. Authentication Issues (401 Errors)

**Symptom:** Agents logging 401 Unauthorized

**Query:**
```sql
SELECT 
  sl.agent_name,
  sl.event_type,
  sl.details,
  a.status AS current_status
FROM public.security_logs sl
LEFT JOIN public.agents a ON sl.agent_name = a.agent_name
WHERE 
  sl.details->>'status_code' = '401'
ORDER BY sl.created_at DESC
LIMIT 50;
```

**Action:**
- Verify token and HMAC match between agent script and database
- Check agent credentials using query #3 in `diagnostic-queries.sql`

### 3. Jobs v3 Migration Status

**Symptom:** Jobs still using v1 (ack-job)

**Query:**
```sql
SELECT 
  COUNT(*) AS total_jobs,
  SUM(CASE WHEN output IS NOT NULL THEN 1 ELSE 0 END) AS v3_jobs,
  ROUND(100.0 * SUM(CASE WHEN output IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 2) AS v3_percent
FROM public.jobs
WHERE created_at > NOW() - INTERVAL '7 days';
```

**Action:**
- If v3 adoption is low (<50%), regenerate agent installers
- Verify agent script includes `StartedAt` parameter using validation script

### 4. Performance Bottlenecks

**Symptom:** Slow operations, timeouts

**Query:**
```sql
SELECT 
  pm.function_name,
  ROUND(AVG(pm.duration_ms), 2) AS avg_ms,
  ROUND(MAX(pm.duration_ms), 2) AS max_ms,
  COUNT(*) AS calls
FROM public.performance_metrics pm
WHERE pm.created_at > NOW() - INTERVAL '24 hours'
GROUP BY pm.function_name
HAVING AVG(pm.duration_ms) > 1000
ORDER BY avg_ms DESC;
```

**Action:**
- Investigate slow functions
- Check database indexes and query plans
- Review Edge Function logs

## System Health Dashboard

### Access

Navigate to `/admin/system-health` in the CyberShield UI.

### Metrics Displayed

1. **Agent Health Score**
   - Percentage of agents with recent heartbeat (<5 min)
   - Breakdown: Active / Pending / Inactive
   - Target: >80% healthy

2. **Jobs (24h)**
   - Total jobs executed
   - Success rate percentage
   - Breakdown: Completed / Failed / Pending
   - Target: >95% success rate

3. **Jobs v3 Adoption**
   - Percentage of jobs using v3 API
   - Visual progress bar
   - Target: 100% adoption

4. **Slow Operations**
   - Edge Functions with avg duration >1s
   - Call count and error count
   - Target: <2s average for all functions

### Health Score Thresholds

- **Healthy (80-100%):** Green badge, system operating normally
- **Degraded (50-79%):** Yellow badge, investigate issues
- **Critical (<50%):** Red badge, immediate action required

## Agent Script Validation

### Pre-Installation Validation

**Always run before installing:**

```powershell
.\scripts\verificar-installer-agente.ps1 -ScriptPath "C:\Downloads\installer.ps1"
```

### What It Checks

1. **Encoding:** UTF-8 without BOM or ASCII (not UTF-16)
2. **Non-ASCII Characters:** Emojis, accents, special symbols
3. **PowerShell 5.1 Syntax:** Compatibility validation
4. **Critical Functions:** Submit-JobResult, Send-Heartbeat, Poll-Jobs, Get-HmacSignature
5. **Jobs v3 Compliance:** Presence of `StartedAt` parameter
6. **CyberShield Signature:** Verification of authentic agent script

### Expected Output

```
=== Verificacao de Script do Agente / Installer ===
[OK] Encoding detectado: UTF-8 sem BOM / ASCII (IDEAL)
[OK] Nenhum caractere fora do ASCII basico detectado.
[OK] Sintaxe PowerShell 5.1 VALIDA
[OK] Funcao Submit-JobResult presente
[OK] Funcao Send-Heartbeat presente
[OK] Funcao Poll-Jobs presente
[OK] Funcao Get-HmacSignature presente
[OK] Parametro/variavel StartedAt encontrado no script
[OK] Assinatura 'CyberShield Agent' encontrada no script

[SUCCESS] Todas as validacoes criticas PASSARAM
```

## Common Issues and Solutions

### Issue: Agent Stays in "Pending"

**Symptoms:**
- No heartbeat after 10+ minutes
- No logs in `C:\CyberShield\logs\`
- Scheduled Task shows error code

**Diagnosis:**
1. Run Query #1 (Find Stuck Agents)
2. Check Windows Event Viewer for Task Scheduler errors
3. Validate installer script encoding

**Solution:**
```sql
-- Cleanup broken agent (replace AGENT_NAME)
BEGIN;
UPDATE public.agent_tokens
SET is_active = false
WHERE agent_id = (SELECT id FROM public.agents WHERE agent_name = 'AGENT_NAME');

UPDATE public.agents
SET status = 'pending', last_heartbeat = NULL
WHERE agent_name = 'AGENT_NAME';
COMMIT;
```
Then regenerate credentials and reinstall.

### Issue: 401 Unauthorized Errors

**Symptoms:**
- Agent sends requests but gets HTTP 401
- Security logs show authentication failures

**Diagnosis:**
1. Run Query #2 (401 Errors)
2. Run Query #3 (Credentials Consistency)
3. Manually check token/HMAC in agent script vs database

**Solution:**
- Regenerate credentials from Troubleshooting page
- Generate NEW installer (old one is invalid)
- Reinstall agent with new credentials

### Issue: Jobs Stuck on v1

**Symptoms:**
- Jobs complete but have no `output` field
- Jobs v3 adoption rate <50%

**Diagnosis:**
1. Run Query #4 (v3 Adoption Rate)
2. Validate agent script includes `StartedAt`:
   ```powershell
   .\scripts\verificar-installer-agente.ps1 -ScriptPath "installer.ps1"
   ```

**Solution:**
- Regenerate ALL agent installers
- Reinstall agents with new scripts
- Verify v3 adoption rate increases

### Issue: UTF-16 Encoding (Script Won't Execute)

**Symptoms:**
- Installer runs but agent script is not created
- Or script is created but Scheduled Task fails to run it
- PowerShell throws "cannot be loaded" errors

**Diagnosis:**
```powershell
# Check file encoding
$bytes = [System.IO.File]::ReadAllBytes("C:\CyberShield\cybershield-agent-AGENTNAME.ps1")
if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    Write-Host "ERROR: File is UTF-16 LE"
}
```

**Solution:**
- This issue should be fixed in installer v3.1.0+
- If detected, regenerate installer from backend
- Contact support if issue persists

## Best Practices

1. **Before Installing:**
   - Always validate installer script with `verificar-installer-agente.ps1`
   - Verify no non-ASCII characters exist

2. **After Installing:**
   - Wait 2-3 minutes for initial heartbeat
   - Check System Health Dashboard
   - Verify agent shows as "healthy"

3. **Regular Monitoring:**
   - Check System Health Dashboard daily
   - Review Performance Metrics weekly
   - Run diagnostic queries monthly

4. **When Issues Arise:**
   - Check System Health Dashboard first
   - Run relevant diagnostic query
   - Use cleanup script if agent is broken
   - Always regenerate installer after credential changes

## Related Documentation

- `VALIDATION_GUIDE.md` - Step-by-step validation workflow
- `TESTING_GUIDE.md` - E2E test procedures
- `scripts/diagnostic-queries.sql` - Complete SQL query library
- `scripts/verificar-installer-agente.ps1` - Script validation tool

## Support

For issues not covered by these diagnostics:

1. Check system health dashboard
2. Run all relevant diagnostic queries
3. Collect agent logs from `C:\CyberShield\logs\`
4. Contact support with diagnostic output
