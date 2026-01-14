-- =====================================================
-- CSA-FH PHASE 1: SECURITY DEFINER HARDENING
-- Fixes functions missing SET search_path = public
-- =====================================================

-- 1. Fix assert_system_allows_jobs (returns void, not boolean)
DROP FUNCTION IF EXISTS public.assert_system_allows_jobs();
CREATE FUNCTION public.assert_system_allows_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_mode system_operational_mode;
BEGIN
  SELECT mode INTO current_mode FROM system_global_state LIMIT 1;
  
  IF current_mode = 'emergency_stop' THEN
    RAISE EXCEPTION 'System in emergency mode - jobs blocked';
  END IF;
END;
$$;

-- 2. Fix get_system_mode_safe
DROP FUNCTION IF EXISTS public.get_system_mode_safe();
CREATE FUNCTION public.get_system_mode_safe()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_mode text;
BEGIN
  SELECT mode::text INTO current_mode FROM system_global_state LIMIT 1;
  RETURN COALESCE(current_mode, 'normal');
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'normal';
END;
$$;

-- 3. Fix get_system_mode (returns system_operational_mode)
DROP FUNCTION IF EXISTS public.get_system_mode();
CREATE FUNCTION public.get_system_mode()
RETURNS system_operational_mode
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_mode system_operational_mode;
BEGIN
  SELECT mode INTO current_mode FROM system_global_state LIMIT 1;
  RETURN COALESCE(current_mode, 'normal'::system_operational_mode);
END;
$$;

-- 4. Fix evaluate_job_slo (complex return type)
DROP FUNCTION IF EXISTS public.evaluate_job_slo();
CREATE FUNCTION public.evaluate_job_slo()
RETURNS TABLE (
  out_tenant_id uuid,
  out_time_window text,
  out_burn_rate numeric,
  out_error_rate numeric,
  out_severity text,
  out_task_created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as out_tenant_id,
    '24h' as out_time_window,
    COALESCE(
      (SELECT COUNT(*)::numeric / NULLIF(COUNT(*) FILTER (WHERE status = 'completed'), 0)
       FROM scheduled_job_runs 
       WHERE tenant_id = t.id 
         AND started_at > now() - interval '24 hours'),
      0
    ) as out_burn_rate,
    COALESCE(
      (SELECT COUNT(*) FILTER (WHERE status = 'failed')::numeric / NULLIF(COUNT(*), 0)
       FROM scheduled_job_runs 
       WHERE tenant_id = t.id 
         AND started_at > now() - interval '24 hours'),
      0
    ) as out_error_rate,
    CASE 
      WHEN (SELECT COUNT(*) FILTER (WHERE status = 'failed') 
            FROM scheduled_job_runs 
            WHERE tenant_id = t.id 
              AND started_at > now() - interval '24 hours') > 10 
      THEN 'critical'
      WHEN (SELECT COUNT(*) FILTER (WHERE status = 'failed') 
            FROM scheduled_job_runs 
            WHERE tenant_id = t.id 
              AND started_at > now() - interval '24 hours') > 5 
      THEN 'warning'
      ELSE 'ok'
    END as out_severity,
    false as out_task_created
  FROM tenants t
  WHERE t.is_active = true;
END;
$$;

-- 5. Fix claim_jobs_for_agent (multiple overloads - fix all)
-- Overload 1: (p_agent_id uuid, p_max_jobs integer)
DROP FUNCTION IF EXISTS public.claim_jobs_for_agent(uuid, integer);
CREATE FUNCTION public.claim_jobs_for_agent(
  p_agent_id uuid,
  p_max_jobs integer
)
RETURNS TABLE(
  job_id uuid,
  job_type text,
  payload jsonb,
  payload_hash text,
  expires_at timestamptz,
  execution_id uuid,
  nonce uuid,
  execution_index bigint,
  previous_execution_hash text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE scheduled_job_runs
    SET 
      status = 'running',
      started_at = now(),
      agent_id = p_agent_id
    WHERE id IN (
      SELECT sjr.id
      FROM scheduled_job_runs sjr
      WHERE sjr.status = 'pending'
        AND sjr.scheduled_for <= now()
      ORDER BY sjr.scheduled_for
      LIMIT p_max_jobs
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, job_key, payload, nonce
  )
  SELECT 
    c.id as job_id,
    sj.job_type,
    c.payload,
    encode(sha256(c.payload::text::bytea), 'hex') as payload_hash,
    now() + interval '1 hour' as expires_at,
    c.id as execution_id,
    c.nonce,
    0::bigint as execution_index,
    '' as previous_execution_hash
  FROM claimed c
  JOIN scheduled_jobs sj ON sj.name = c.job_key;
END;
$$;

-- Overload 2: (p_agent_id uuid, p_agent_name text, p_limit integer)
DROP FUNCTION IF EXISTS public.claim_jobs_for_agent(uuid, text, integer);
CREATE FUNCTION public.claim_jobs_for_agent(
  p_agent_id uuid,
  p_agent_name text,
  p_limit integer
)
RETURNS TABLE(
  id uuid,
  type text,
  payload jsonb,
  approved boolean,
  agent_id uuid,
  agent_name text,
  priority integer,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE scheduled_job_runs
    SET 
      status = 'running',
      started_at = now(),
      agent_id = p_agent_id
    WHERE scheduled_job_runs.id IN (
      SELECT sjr.id
      FROM scheduled_job_runs sjr
      WHERE sjr.status = 'pending'
        AND sjr.scheduled_for <= now()
      ORDER BY sjr.scheduled_for
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING scheduled_job_runs.id, job_key, scheduled_job_runs.payload, scheduled_job_runs.created_at
  )
  SELECT 
    c.id,
    sj.job_type as type,
    c.payload,
    true as approved,
    p_agent_id as agent_id,
    p_agent_name as agent_name,
    1 as priority,
    c.created_at,
    now() + interval '1 hour' as expires_at
  FROM claimed c
  JOIN scheduled_jobs sj ON sj.name = c.job_key;
END;
$$;

-- Overload 3: (p_agent_id uuid, p_agent_name text, p_tenant_id uuid, p_limit integer)
DROP FUNCTION IF EXISTS public.claim_jobs_for_agent(uuid, text, uuid, integer);
CREATE FUNCTION public.claim_jobs_for_agent(
  p_agent_id uuid,
  p_agent_name text,
  p_tenant_id uuid,
  p_limit integer
)
RETURNS TABLE(
  job_id uuid,
  job_type text,
  payload jsonb,
  execution_id uuid,
  nonce uuid,
  payload_hash text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE scheduled_job_runs
    SET 
      status = 'running',
      started_at = now(),
      agent_id = p_agent_id
    WHERE scheduled_job_runs.id IN (
      SELECT sjr.id
      FROM scheduled_job_runs sjr
      WHERE sjr.status = 'pending'
        AND sjr.scheduled_for <= now()
        AND sjr.tenant_id = p_tenant_id
      ORDER BY sjr.scheduled_for
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING scheduled_job_runs.id, job_key, scheduled_job_runs.payload, scheduled_job_runs.nonce
  )
  SELECT 
    c.id as job_id,
    sj.job_type,
    c.payload,
    c.id as execution_id,
    c.nonce,
    encode(sha256(c.payload::text::bytea), 'hex') as payload_hash,
    now() + interval '1 hour' as expires_at
  FROM claimed c
  JOIN scheduled_jobs sj ON sj.name = c.job_key;
END;
$$;

-- =====================================================
-- VALIDATION RPCs FOR CONTRACT TESTS
-- =====================================================

-- RPC: Find SECURITY DEFINER functions without search_path
CREATE OR REPLACE FUNCTION public.find_unsafe_definer_functions()
RETURNS TABLE (proname text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.proname::text
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.prosecdef = true
    AND n.nspname = 'public'
    AND (p.proconfig IS NULL 
         OR NOT p.proconfig @> ARRAY['search_path=public']);
$$;

-- RPC: Describe table columns (for contract tests)
CREATE OR REPLACE FUNCTION public.describe_table(p_table_name text)
RETURNS TABLE (column_name text, data_type text, is_nullable text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.column_name::text,
    c.data_type::text,
    c.is_nullable::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table_name
  ORDER BY c.ordinal_position;
$$;

-- RPC: Check if emergency mode is active
CREATE OR REPLACE FUNCTION public.is_emergency_mode()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT mode = 'emergency_stop' FROM system_global_state LIMIT 1),
    false
  );
$$;

-- =====================================================
-- HEARTBEAT INFRASTRUCTURE FOR CRON MONITORING
-- =====================================================

-- Create heartbeat table for job monitoring (without FK to scheduled_jobs)
CREATE TABLE IF NOT EXISTS public.scheduled_job_heartbeat (
  job_key text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expected_interval interval NOT NULL DEFAULT '1 hour',
  missed_count int DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_job_heartbeat ENABLE ROW LEVEL SECURITY;

-- RLS: Only service_role can manage heartbeats
CREATE POLICY "Service role manages heartbeats"
ON public.scheduled_job_heartbeat
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- View: Detect silent cron jobs
CREATE OR REPLACE VIEW public.v_cron_silence AS
SELECT 
  h.job_key,
  h.last_seen_at,
  h.expected_interval,
  now() - h.last_seen_at AS silence_duration,
  h.missed_count,
  h.last_error,
  CASE 
    WHEN now() - h.last_seen_at > h.expected_interval * 3 THEN 'critical'
    WHEN now() - h.last_seen_at > h.expected_interval * 2 THEN 'warning'
    ELSE 'ok'
  END AS status
FROM scheduled_job_heartbeat h
WHERE now() - h.last_seen_at > h.expected_interval;

-- Function: Update heartbeat (called by jobs on completion)
CREATE OR REPLACE FUNCTION public.update_job_heartbeat(
  p_job_key text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO scheduled_job_heartbeat (job_key, last_seen_at, last_error, updated_at)
  VALUES (p_job_key, now(), p_error, now())
  ON CONFLICT (job_key) DO UPDATE SET
    last_seen_at = now(),
    missed_count = CASE WHEN p_error IS NULL THEN 0 ELSE scheduled_job_heartbeat.missed_count + 1 END,
    last_error = p_error,
    updated_at = now();
END;
$$;

-- Grant execute to authenticated users for contract tests
GRANT EXECUTE ON FUNCTION public.find_unsafe_definer_functions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.describe_table(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_emergency_mode() TO authenticated;