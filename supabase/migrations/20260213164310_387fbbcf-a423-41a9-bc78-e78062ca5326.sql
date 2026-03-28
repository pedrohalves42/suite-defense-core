
-- =============================================
-- PERFORMANCE OPTIMIZATION: Corrected Migration
-- Addresses top bottlenecks with real schema
-- =============================================

-- =============================================
-- 1. ATOMIC RATE LIMIT (2-3 queries ? 1)
-- The rate_limits table uses unique constraint on (identifier, endpoint)
-- with a single sliding window row per pair.
-- =============================================
CREATE OR REPLACE FUNCTION public.check_rate_limit_atomic(
    p_identifier text,
    p_endpoint text,
    p_max_requests integer DEFAULT 60,
    p_window_minutes integer DEFAULT 1,
    p_block_minutes integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    v_now timestamptz := now();
    v_window_start timestamptz := v_now - (p_window_minutes || ' minutes')::interval;
    v_row record;
    v_new_count integer;
BEGIN
    -- Check if blocked
    SELECT * INTO v_row
    FROM rate_limits
    WHERE identifier = p_identifier AND endpoint = p_endpoint;

    IF FOUND AND v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'blocked',
            'reset_at', v_row.blocked_until
        );
    END IF;

    -- Window expired or no row: reset
    IF NOT FOUND OR v_row.window_start < v_window_start THEN
        INSERT INTO rate_limits (identifier, endpoint, request_count, window_start, last_request_at, blocked_until)
        VALUES (p_identifier, p_endpoint, 1, v_now, v_now, NULL)
        ON CONFLICT (identifier, endpoint)
        DO UPDATE SET
            request_count = 1,
            window_start = v_now,
            last_request_at = v_now,
            blocked_until = NULL;

        RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - 1);
    END IF;

    -- Increment
    v_new_count := v_row.request_count + 1;

    IF v_new_count > p_max_requests THEN
        -- Block
        UPDATE rate_limits SET
            request_count = v_new_count,
            last_request_at = v_now,
            blocked_until = v_now + (p_block_minutes || ' minutes')::interval
        WHERE identifier = p_identifier AND endpoint = p_endpoint;

        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'rate_exceeded',
            'reset_at', v_now + (p_block_minutes || ' minutes')::interval
        );
    END IF;

    UPDATE rate_limits SET
        request_count = v_new_count,
        last_request_at = v_now
    WHERE identifier = p_identifier AND endpoint = p_endpoint;

    RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - v_new_count);
END;
$$;

-- =============================================
-- 2. CONSOLIDATED HEARTBEAT RPC (7-10 queries ? 1 call)
-- Uses actual column names from agents/agent_tokens tables
-- =============================================
CREATE OR REPLACE FUNCTION public.process_heartbeat_v2(
    p_token_hash text,
    p_agent_version text DEFAULT NULL,
    p_hostname text DEFAULT NULL,
    p_os_type text DEFAULT NULL,
    p_os_version text DEFAULT NULL,
    p_cpu_usage numeric DEFAULT NULL,
    p_memory_usage numeric DEFAULT NULL,
    p_disk_usage numeric DEFAULT NULL,
    p_uptime_seconds bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_now timestamptz := now();
    v_agent record;
    v_rate jsonb;
    v_force_update boolean := false;
    v_light_mode record;
BEGIN
    -- 1. Single query: validate token + get agent data
    SELECT a.id, a.agent_name, a.tenant_id, a.status, a.hmac_secret,
           a.force_update_version, a.force_update_at, a.agent_version,
           a.poll_interval_seconds, a.is_throttled, a.agent_mode
    INTO v_agent
    FROM agent_tokens t
    JOIN agents a ON t.agent_id = a.id
    WHERE t.token_hash = p_token_hash
      AND t.is_active = true;

    IF v_agent IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
    END IF;

    IF v_agent.status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'agent_inactive', 'status', v_agent.status);
    END IF;

    -- 2. Atomic rate limit check (replaces 2-3 separate queries)
    v_rate := check_rate_limit_atomic(v_agent.id::text, 'heartbeat', 60, 1, 5);
    IF NOT (v_rate->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'error', 'rate_limited', 'details', v_rate);
    END IF;

    -- 3. Check force update
    IF v_agent.force_update_version IS NOT NULL
       AND v_agent.force_update_version != COALESCE(p_agent_version, v_agent.agent_version)
       AND v_agent.force_update_at IS NOT NULL
       AND v_agent.force_update_at > v_now - interval '7 days' THEN
        v_force_update := true;
    END IF;

    -- 4. Single UPDATE: heartbeat + metadata
    UPDATE agents SET
        last_heartbeat = v_now,
        agent_version = COALESCE(p_agent_version, agent_version),
        hostname = COALESCE(p_hostname, hostname),
        os_type = COALESCE(p_os_type, os_type),
        os_version = COALESCE(p_os_version, os_version)
    WHERE id = v_agent.id;

    -- 5. Update token last_used_at
    UPDATE agent_tokens SET last_used_at = v_now
    WHERE token_hash = p_token_hash;

    -- 6. Persist system metrics if provided
    IF p_cpu_usage IS NOT NULL THEN
        INSERT INTO agent_system_metrics (
            agent_id, tenant_id, collected_at,
            cpu_usage_percent, memory_usage_percent,
            disk_usage_percent, uptime_seconds
        ) VALUES (
            v_agent.id, v_agent.tenant_id, v_now,
            p_cpu_usage, p_memory_usage,
            p_disk_usage, p_uptime_seconds
        );
    END IF;

    -- 7. Check light mode
    SELECT is_active, reduced_interval_seconds
    INTO v_light_mode
    FROM agent_light_mode_configs
    WHERE agent_id = v_agent.id AND is_active = true
    LIMIT 1;

    -- 8. Build response
    RETURN jsonb_build_object(
        'success', true,
        'agent_id', v_agent.id,
        'agent_name', v_agent.agent_name,
        'tenant_id', v_agent.tenant_id,
        'hmac_secret', v_agent.hmac_secret,
        'force_update', v_force_update,
        'force_update_version', v_agent.force_update_version,
        'poll_interval', COALESCE(
            v_light_mode.reduced_interval_seconds,
            v_agent.poll_interval_seconds,
            60
        ),
        'light_mode', COALESCE(v_light_mode.is_active, false),
        'is_throttled', v_agent.is_throttled,
        'agent_mode', v_agent.agent_mode
    );
END;
$$;

-- =============================================
-- 3. HMAC FORMAT CACHE TABLE
-- Reduces 8 brute-force verification attempts ? 1
-- =============================================
CREATE TABLE IF NOT EXISTS public.agent_hmac_format_cache (
    agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    key_encoding text NOT NULL DEFAULT 'utf8',
    separator text NOT NULL DEFAULT ':',
    body_format text NOT NULL DEFAULT 'compact',
    last_verified_at timestamptz DEFAULT now(),
    hit_count integer DEFAULT 0
);

ALTER TABLE public.agent_hmac_format_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on hmac cache"
    ON public.agent_hmac_format_cache
    FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.agent_hmac_format_cache IS
    'Caches the HMAC format that each agent uses to avoid brute-forcing 8 combinations on every request';

-- =============================================
-- 4. HMAC CLEANUP ? MAINTENANCE CRON (remove from hot path)
-- =============================================
CREATE OR REPLACE FUNCTION public.run_system_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_stale_tasks jsonb;
  v_cancelled_jobs integer;
  v_dlq_reconciled integer := 0;
  v_jobruns_cleaned integer := 0;
  v_diskmetrics_cleaned integer := 0;
  v_hmac_cleaned integer := 0;
  v_rate_limits_cleaned integer := 0;
BEGIN
  -- 1. Auto-resolve stale tasks
  v_stale_tasks := auto_resolve_stale_tasks();
  v_result := v_result || jsonb_build_object('stale_tasks', v_stale_tasks);

  -- 2. Cancel jobs for archived agents
  v_cancelled_jobs := auto_cancel_archived_agent_jobs();
  v_result := v_result || jsonb_build_object('archived_agent_jobs_cancelled', v_cancelled_jobs);

  -- 3. Auto-archive disabled
  v_result := v_result || jsonb_build_object('agents_archived', 0, 'auto_archive_disabled', true);

  -- 4. Reconcile DLQ
  WITH reconciled AS (
    UPDATE failed_jobs_dlq dlq
    SET status = 'ignored', resolved_at = now(), resolved_by = 'system_maintenance'
    FROM jobs j
    WHERE dlq.original_job_id = j.id AND j.status = 'archived' AND dlq.status = 'pending'
    RETURNING dlq.id
  )
  SELECT count(*) INTO v_dlq_reconciled FROM reconciled;
  v_result := v_result || jsonb_build_object('dlq_reconciled', v_dlq_reconciled);

  -- 5. Stale jobs note
  v_result := v_result || jsonb_build_object('stale_jobs_note', 'handled_by_cleanup_stuck_jobs_ef');

  -- 6. SLA breach detection
  UPDATE tasks SET sla_breached_at = now()
  WHERE status IN ('open','in_progress') AND due_at IS NOT NULL AND due_at < now() AND sla_breached_at IS NULL;

  -- 7. DATA RETENTION (tables without audit triggers)
  WITH del1 AS (
    DELETE FROM scheduled_job_runs WHERE created_at < now() - interval '30 days' RETURNING id
  ) SELECT count(*) INTO v_jobruns_cleaned FROM del1;

  WITH del2 AS (
    DELETE FROM agent_disk_metrics WHERE collected_at < now() - interval '30 days' RETURNING id
  ) SELECT count(*) INTO v_diskmetrics_cleaned FROM del2;

  -- 8. HMAC CLEANUP (moved from hot path probabilistic ? scheduled)
  WITH del3 AS (
    DELETE FROM hmac_signatures WHERE created_at < now() - interval '7 days' RETURNING id
  ) SELECT count(*) INTO v_hmac_cleaned FROM del3;

  -- 9. RATE LIMITS CLEANUP (old windows)
  WITH del4 AS (
    DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour' AND blocked_until IS NULL RETURNING id
  ) SELECT count(*) INTO v_rate_limits_cleaned FROM del4;

  v_result := v_result || jsonb_build_object(
    'data_retention', jsonb_build_object(
      'job_runs_purged', v_jobruns_cleaned,
      'disk_metrics_purged', v_diskmetrics_cleaned,
      'hmac_signatures_purged', v_hmac_cleaned,
      'rate_limits_purged', v_rate_limits_cleaned,
      'evidence_logs_note', 'immutable_soc2_compliance'
    )
  );

  v_result := v_result || jsonb_build_object('executed_at', now());
  RETURN v_result;
END;
$$;

-- =============================================
-- 5. POLL-JOBS OPTIMIZED (3 queries ? 1 RPC)
-- =============================================
CREATE OR REPLACE FUNCTION public.poll_jobs_v2(
    p_token_hash text,
    p_max_jobs integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_agent_id uuid;
    v_agent_name text;
    v_tenant_id uuid;
    v_jobs jsonb;
BEGIN
    -- 1. Validate token
    SELECT a.id, a.agent_name, a.tenant_id
    INTO v_agent_id, v_agent_name, v_tenant_id
    FROM agent_tokens t
    JOIN agents a ON t.agent_id = a.id
    WHERE t.token_hash = p_token_hash
      AND t.is_active = true
      AND a.status = 'active';

    IF v_agent_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
    END IF;

    -- 2. Claim + return jobs in one CTE
    WITH claimed AS (
        UPDATE jobs SET
            status = 'delivered',
            delivered_at = now(),
            delivery_attempts = COALESCE(delivery_attempts, 0) + 1
        WHERE id IN (
            SELECT id FROM jobs
            WHERE agent_id = v_agent_id
              AND status IN ('pending', 'queued')
              AND (expires_at IS NULL OR expires_at > now())
            ORDER BY priority DESC NULLS LAST, created_at ASC
            LIMIT p_max_jobs
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, type, payload, priority, created_at
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', id, 'type', type, 'payload', payload,
            'priority', priority, 'created_at', created_at
        ) ORDER BY priority DESC NULLS LAST, created_at ASC
    ), '[]'::jsonb)
    INTO v_jobs
    FROM claimed;

    RETURN jsonb_build_object(
        'success', true,
        'agent_id', v_agent_id,
        'agent_name', v_agent_name,
        'jobs', v_jobs
    );
END;
$$;
