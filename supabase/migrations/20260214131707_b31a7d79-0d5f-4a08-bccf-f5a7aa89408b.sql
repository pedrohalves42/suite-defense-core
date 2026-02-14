
-- ============================================================
-- ZERO-GAP PHASE 2+3 RETRY: Data cleanup + Dedup + Monitoring
-- ============================================================

-- FASE 2A: Clean expired stuck jobs
UPDATE jobs
SET status = 'failed',
    completed_at = now(),
    error_message = '[DLQ:EXPIRED_TTL] Zero-Gap Phase 2 cleanup',
    failure_class = 'EXPIRED'
WHERE status IN ('pending', 'queued', 'delivered')
  AND expires_at IS NOT NULL
  AND expires_at < now();

-- FASE 2B: Cancel zombie delivered jobs (>4h, no TTL)
UPDATE jobs
SET status = 'failed',
    completed_at = now(),
    error_message = '[DLQ:ZOMBIE_DELIVERED] Delivered >4h without completion',
    failure_class = 'ZOMBIE'
WHERE status = 'delivered'
  AND created_at < now() - interval '4 hours'
  AND expires_at IS NULL;

-- FASE 2C: Deduplicate active jobs
WITH ranked AS (
  SELECT id, agent_id, type, 
         ROW_NUMBER() OVER (PARTITION BY agent_id, type ORDER BY created_at DESC) as rn
  FROM jobs
  WHERE status IN ('pending', 'queued', 'delivered')
)
UPDATE jobs SET 
  status = 'cancelled',
  completed_at = now(),
  error_message = '[DEDUP] Cancelled by Zero-Gap deduplication'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- FASE 2D: Backfill DLQ
INSERT INTO failed_jobs_dlq (original_job_id, tenant_id, agent_id, agent_name, job_type, payload, error_message, failure_class, status, max_retries)
SELECT j.id, j.tenant_id, j.agent_id, j.agent_name, j.type, j.payload,
       COALESCE(j.error_message, 'Unknown failure'), 
       COALESCE(j.failure_class, 'UNKNOWN'),
       'pending', 3
FROM jobs j
LEFT JOIN failed_jobs_dlq dlq ON dlq.original_job_id = j.id
WHERE j.status = 'failed' AND dlq.id IS NULL
AND j.created_at > now() - interval '7 days';

-- FASE 2E: Mark exhausted DLQ
UPDATE failed_jobs_dlq 
SET status = 'exhausted'
WHERE status = 'pending' AND retry_count >= max_retries;

-- FASE 3A: Dedup index (duplicates cleaned above)
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_dedup_active
ON jobs (agent_id, type)
WHERE status IN ('pending', 'queued', 'delivered');

-- FASE 3B: Zero-Gap health monitoring view
CREATE OR REPLACE VIEW v_zero_gap_health WITH (security_invoker = on) AS
SELECT
  (SELECT count(*) FROM jobs WHERE status IN ('pending','queued','delivered') AND expires_at < now()) AS expired_jobs_stuck,
  (SELECT count(*) FROM jobs WHERE status = 'delivered' AND created_at < now() - interval '2 hours') AS zombie_delivered,
  (SELECT count(*) FROM failed_jobs_dlq WHERE status = 'pending') AS dlq_pending,
  (SELECT count(*) FROM failed_jobs_dlq WHERE status = 'exhausted') AS dlq_exhausted,
  (SELECT count(*) FROM tasks WHERE status IN ('open','in_progress') AND updated_at < now() - interval '14 days') AS stale_tasks,
  (SELECT count(*) FROM cron_health_checks WHERE consecutive_failures > 3) AS failing_crons,
  (SELECT count(*) FROM domain_events) AS domain_events_total,
  (SELECT count(*) FROM jobs WHERE status IN ('pending','queued','delivered')) AS active_jobs,
  (SELECT count(*) FROM jobs WHERE status = 'completed' AND created_at > now() - interval '24 hours') AS completed_24h,
  (SELECT count(*) FROM jobs WHERE status = 'failed' AND created_at > now() - interval '24 hours') AS failed_24h;

-- Reset cron counters (maintenance function was fixed in earlier migration)
UPDATE cron_health_checks 
SET consecutive_failures = 0, last_error = NULL, updated_at = now()
WHERE cron_name IN (
  'system-maintenance-30min',
  'refresh-incident-slos',
  'sync-pgcron-health-every-5min',
  'detect-blocked-attempts-every-5min'
);
