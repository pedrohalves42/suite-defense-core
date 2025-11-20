-- ============================================
-- DIAGNOSTIC QUERIES FOR CYBERSHIELD AGENTS
-- ============================================
-- Use estas queries no Supabase SQL Editor para diagnosticar problemas

-- ============================================
-- 1. FIND STUCK AGENTS (pending, no heartbeat)
-- ============================================
SELECT 
  a.id,
  a.agent_name,
  a.status,
  a.enrolled_at,
  a.last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) / 60 AS minutes_since_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at)) / 60 AS minutes_since_enrollment,
  t.name AS tenant_name
FROM public.agents a
JOIN public.tenants t ON a.tenant_id = t.id
WHERE 
  a.status = 'pending'
  AND (a.last_heartbeat IS NULL OR a.last_heartbeat < NOW() - INTERVAL '10 minutes')
ORDER BY a.enrolled_at DESC;

-- ============================================
-- 2. FIND AGENTS WITH 401 ERRORS (auth issues)
-- ============================================
SELECT 
  sl.agent_name,
  sl.event_type,
  sl.severity,
  sl.details,
  sl.created_at,
  a.status AS current_status,
  a.last_heartbeat
FROM public.security_logs sl
LEFT JOIN public.agents a ON sl.agent_name = a.agent_name
WHERE 
  sl.details->>'status_code' = '401'
  OR sl.event_type ILIKE '%unauthorized%'
  OR sl.event_type ILIKE '%401%'
ORDER BY sl.created_at DESC
LIMIT 50;

-- ============================================
-- 3. CHECK AGENT CREDENTIALS CONSISTENCY
-- ============================================
SELECT 
  a.id,
  a.agent_name,
  a.status,
  a.hmac_secret IS NOT NULL AS has_hmac,
  LENGTH(a.hmac_secret) AS hmac_length,
  at.token IS NOT NULL AS has_token,
  at.is_active AS token_active,
  at.last_used_at AS token_last_used
FROM public.agents a
LEFT JOIN public.agent_tokens at ON a.id = at.agent_id
WHERE a.status IN ('pending', 'inactive')
ORDER BY a.enrolled_at DESC;

-- ============================================
-- 4. JOBS V3 ADOPTION RATE
-- ============================================
SELECT 
  COUNT(*) AS total_jobs,
  SUM(CASE WHEN output IS NOT NULL THEN 1 ELSE 0 END) AS v3_jobs,
  SUM(CASE WHEN output IS NULL THEN 1 ELSE 0 END) AS v1_jobs,
  ROUND(100.0 * SUM(CASE WHEN output IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 2) AS v3_adoption_percent,
  MAX(created_at) FILTER (WHERE output IS NOT NULL) AS last_v3_job,
  MAX(created_at) FILTER (WHERE output IS NULL) AS last_v1_job
FROM public.jobs
WHERE created_at > NOW() - INTERVAL '7 days';

-- ============================================
-- 5. JOBS V3 WITH MISSING TIMESTAMPS
-- ============================================
SELECT 
  j.id,
  j.agent_name,
  j.type,
  j.status,
  j.created_at,
  j.started_at,
  j.finished_at,
  j.execution_time_seconds,
  j.output IS NOT NULL AS is_v3
FROM public.jobs j
WHERE 
  j.output IS NOT NULL  -- v3 jobs
  AND j.status IN ('completed', 'failed')
  AND (j.started_at IS NULL OR j.finished_at IS NULL OR j.execution_time_seconds IS NULL)
ORDER BY j.created_at DESC
LIMIT 50;

-- ============================================
-- 6. CLEANUP SCRIPT FOR BROKEN AGENT
-- ============================================
-- Replace 'AGENT_NAME_HERE' with actual agent name
/*
BEGIN;

-- Step 1: Invalidate old tokens
UPDATE public.agent_tokens
SET is_active = false
WHERE agent_id = (SELECT id FROM public.agents WHERE agent_name = 'AGENT_NAME_HERE');

-- Step 2: Cancel pending jobs
UPDATE public.jobs
SET status = 'cancelled',
    error_message = 'Agent reset - credentials regenerated'
WHERE agent_name = 'AGENT_NAME_HERE'
  AND status IN ('queued', 'pending');

-- Step 3: Reset agent status
UPDATE public.agents
SET status = 'pending',
    last_heartbeat = NULL
WHERE agent_name = 'AGENT_NAME_HERE';

-- Step 4: Check results
SELECT * FROM public.agents WHERE agent_name = 'AGENT_NAME_HERE';
SELECT * FROM public.agent_tokens WHERE agent_id = (SELECT id FROM public.agents WHERE agent_name = 'AGENT_NAME_HERE');

COMMIT;
-- After this, regenerate credentials and reinstall the agent
*/

-- ============================================
-- 7. INSTALLATION ANALYTICS (success rate)
-- ============================================
SELECT 
  DATE_TRUNC('day', ia.created_at) AS install_date,
  ia.platform,
  COUNT(*) AS total_attempts,
  SUM(CASE WHEN ia.success = true THEN 1 ELSE 0 END) AS successful,
  SUM(CASE WHEN ia.success = false THEN 1 ELSE 0 END) AS failed,
  ROUND(100.0 * SUM(CASE WHEN ia.success = true THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate_percent
FROM public.installation_analytics ia
WHERE ia.created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', ia.created_at), ia.platform
ORDER BY install_date DESC;

-- ============================================
-- 8. ENROLLMENT KEYS HEALTH CHECK
-- ============================================
SELECT 
  ek.id,
  ek.created_at,
  ek.expires_at,
  ek.is_active,
  ek.current_uses,
  ek.max_uses,
  ek.used_by_agent,
  ek.used_at,
  EXTRACT(EPOCH FROM (ek.expires_at - NOW())) / 3600 AS hours_until_expiry,
  CASE 
    WHEN ek.expires_at < NOW() THEN 'expired'
    WHEN ek.current_uses >= ek.max_uses THEN 'exhausted'
    WHEN ek.is_active = false THEN 'inactive'
    ELSE 'active'
  END AS key_status
FROM public.enrollment_keys ek
ORDER BY ek.created_at DESC
LIMIT 100;

-- ============================================
-- 9. PERFORMANCE METRICS (slow operations)
-- ============================================
SELECT 
  pm.function_name,
  pm.operation_type,
  COUNT(*) AS call_count,
  ROUND(AVG(pm.duration_ms), 2) AS avg_duration_ms,
  ROUND(MAX(pm.duration_ms), 2) AS max_duration_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pm.duration_ms), 2) AS p95_duration_ms,
  SUM(CASE WHEN pm.status_code >= 400 THEN 1 ELSE 0 END) AS error_count
FROM public.performance_metrics pm
WHERE pm.created_at > NOW() - INTERVAL '24 hours'
GROUP BY pm.function_name, pm.operation_type
HAVING AVG(pm.duration_ms) > 1000  -- slower than 1 second
ORDER BY avg_duration_ms DESC;

-- ============================================
-- 10. SYSTEM HEALTH SUMMARY
-- ============================================
WITH agent_stats AS (
  SELECT 
    COUNT(*) AS total_agents,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_agents,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_agents,
    SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive_agents,
    SUM(CASE WHEN last_heartbeat > NOW() - INTERVAL '5 minutes' THEN 1 ELSE 0 END) AS healthy_agents
  FROM public.agents
),
job_stats AS (
  SELECT 
    COUNT(*) AS total_jobs_24h,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_jobs,
    SUM(CASE WHEN status IN ('queued', 'pending') THEN 1 ELSE 0 END) AS pending_jobs
  FROM public.jobs
  WHERE created_at > NOW() - INTERVAL '24 hours'
)
SELECT 
  'SYSTEM HEALTH SUMMARY' AS report_title,
  NOW() AS generated_at,
  jsonb_build_object(
    'agents', jsonb_build_object(
      'total', a.total_agents,
      'active', a.active_agents,
      'pending', a.pending_agents,
      'inactive', a.inactive_agents,
      'healthy', a.healthy_agents
    ),
    'jobs_24h', jsonb_build_object(
      'total', j.total_jobs_24h,
      'completed', j.completed_jobs,
      'failed', j.failed_jobs,
      'pending', j.pending_jobs
    )
  ) AS summary
FROM agent_stats a, job_stats j;
