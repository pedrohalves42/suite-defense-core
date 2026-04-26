-- =============================================================================
-- Phase 1: CRITICAL-003 - Add failed_no_execution anomaly to v_job_health_anomalies
-- =============================================================================

CREATE OR REPLACE VIEW public.v_job_health_anomalies AS
-- Existing anomalies
SELECT 'pending_approved'::text AS anomaly_type,
    count(*) AS count,
    min(jobs.created_at) AS oldest
FROM jobs
WHERE jobs.status = 'pending'::text AND jobs.approved = true

UNION ALL

SELECT 'terminal_no_completed_at'::text AS anomaly_type,
    count(*) AS count,
    min(jobs.created_at) AS oldest
FROM jobs
WHERE (jobs.status = ANY (ARRAY['failed'::text, 'completed'::text, 'cancelled'::text])) 
  AND jobs.completed_at IS NULL

UNION ALL

SELECT 'failed_no_dlq'::text AS anomaly_type,
    count(*) AS count,
    min(j.created_at) AS oldest
FROM jobs j
LEFT JOIN failed_jobs_dlq dlq ON dlq.original_job_id = j.id
WHERE j.status = 'failed'::text AND dlq.id IS NULL

UNION ALL

SELECT 'zombie_delivered'::text AS anomaly_type,
    count(*) AS count,
    min(jobs.delivered_at) AS oldest
FROM jobs
WHERE jobs.status = 'delivered'::text 
  AND jobs.delivered_at < (now() - '02:00:00'::interval)

UNION ALL

SELECT 'expired_active_keys'::text AS anomaly_type,
    count(*) AS count,
    min(enrollment_keys.expires_at) AS oldest
FROM enrollment_keys
WHERE enrollment_keys.expires_at < now() AND enrollment_keys.is_active = true

UNION ALL

-- NEW: Jobs failed without any execution record (last 7 days)
SELECT 'failed_no_execution'::text AS anomaly_type,
    count(*) AS count,
    min(j.completed_at) AS oldest
FROM jobs j
WHERE j.status = 'failed'
  AND NOT EXISTS (SELECT 1 FROM job_executions je WHERE je.job_id = j.id)
  AND j.completed_at > NOW() - INTERVAL '7 days';

-- =============================================================================
-- Phase 2: HIGH-002 - Cleanup orphan profiles
-- =============================================================================

-- Create audit table matching actual profiles schema
CREATE TABLE IF NOT EXISTS public._audit_orphan_profiles (
  id UUID PRIMARY KEY,
  user_id UUID,
  full_name TEXT,
  username TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  archive_reason TEXT DEFAULT 'orphan_cleanup_2026-01-10'
);

-- Archive orphan profiles before deletion (profiles where user_id doesn't exist in auth.users)
INSERT INTO public._audit_orphan_profiles (id, user_id, full_name, username, created_at, updated_at)
SELECT p.id, p.user_id, p.full_name, p.username, p.created_at, p.updated_at
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id)
ON CONFLICT (id) DO NOTHING;

-- Delete orphan profiles
DELETE FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id);

-- =============================================================================
-- Phase 3: HIGH-004 - Archive duplicate hostname agents + unique index
-- =============================================================================

-- Archive duplicate agents (keep most recent active per tenant/hostname)
-- Using enrolled_at instead of created_at (agents table schema)
WITH duplicates AS (
  SELECT 
    id,
    hostname,
    tenant_id,
    last_heartbeat,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, hostname 
      ORDER BY last_heartbeat DESC NULLS LAST, enrolled_at DESC
    ) as rn
  FROM agents
  WHERE hostname IS NOT NULL AND status != 'archived'
)
UPDATE agents 
SET status = 'archived',
    archived_at = NOW()
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_unique_hostname_per_tenant 
ON agents (tenant_id, hostname) 
WHERE hostname IS NOT NULL AND status != 'archived';

-- =============================================================================
-- Documentation
-- =============================================================================
COMMENT ON VIEW v_job_health_anomalies IS 
'Consolidated job engine health anomalies view. Updated 2026-01-10 to include failed_no_execution detection per ADR-037.';