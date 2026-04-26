-- =============================================================================
-- V-003 FIX: Add security_invoker to critical views
-- Must DROP and CREATE because CREATE OR REPLACE can't add options
-- =============================================================================

-- 1. active_agents
DROP VIEW IF EXISTS active_agents CASCADE;
CREATE VIEW active_agents WITH (security_invoker = on) AS
SELECT id,
    agent_name,
    display_name,
    hostname,
    status,
    tenant_id,
    last_heartbeat,
    agent_version,
    os_type,
    os_version,
    enrolled_at,
    is_throttled,
    throttled_at,
    throttle_reason,
    is_isolated,
    isolated_at,
    isolation_reason,
    safe_mode_entered_at,
    safe_mode_reason,
    agent_mode,
    agent_state,
    agent_state_reason,
    agent_state_changed_at,
    offline_reason,
    offline_detected_at,
    archived_at,
    archived_reason,
    payload_hash,
    force_update_version,
    force_update_reason,
    force_update_at,
    last_forced_update_applied,
    ed25519_supported,
    signature_mode,
    result_public_key,
    result_key_fingerprint,
    result_key_registered_at,
    last_block_sync_at,
    poll_interval_seconds,
    agent_version_code,
    force_update_override_safe_mode,
    force_update_override_safe_mode_expires_at,
    requires_revalidation,
    revalidation_reason,
    revalidation_required_at
FROM agents
WHERE archived_at IS NULL 
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 2. agent_snapshots
DROP VIEW IF EXISTS agent_snapshots CASCADE;
CREATE VIEW agent_snapshots WITH (security_invoker = on) AS
SELECT 
    a.id as agent_id,
    a.tenant_id,
    a.agent_name,
    a.display_name,
    a.hostname,
    a.status,
    a.agent_version,
    a.last_heartbeat,
    a.agent_mode,
    a.enrolled_at as created_at
FROM agents a
WHERE a.archived_at IS NULL
  AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 3. agents_health_view
DROP VIEW IF EXISTS agents_health_view CASCADE;
CREATE VIEW agents_health_view WITH (security_invoker = on) AS
SELECT a.id,
    a.tenant_id,
    a.agent_name,
    a.display_name,
    a.hostname,
    a.status,
    a.agent_state,
    a.last_heartbeat,
    a.agent_version,
    a.os_type,
    a.os_version,
    a.enrolled_at,
    a.is_isolated,
    a.isolation_reason,
    m.cpu_usage_percent,
    m.memory_usage_percent,
    m.disk_usage_percent,
    m.uptime_seconds,
    m.collected_at AS metrics_collected_at,
    CASE
        WHEN a.last_heartbeat IS NULL THEN 'unknown'
        WHEN a.last_heartbeat > NOW() - INTERVAL '5 minutes' THEN 'healthy'
        WHEN a.last_heartbeat > NOW() - INTERVAL '15 minutes' THEN 'warning'
        ELSE 'critical'
    END AS health_status
FROM agents a
LEFT JOIN LATERAL (
    SELECT cpu_usage_percent, memory_usage_percent, disk_usage_percent, uptime_seconds, collected_at
    FROM agent_system_metrics
    WHERE agent_id = a.id
    ORDER BY collected_at DESC
    LIMIT 1
) m ON true
WHERE a.archived_at IS NULL 
  AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 4. dlq_categorized
DROP VIEW IF EXISTS dlq_categorized CASCADE;
CREATE VIEW dlq_categorized WITH (security_invoker = on) AS
SELECT id,
    tenant_id,
    agent_id,
    job_type,
    error_message,
    retry_count,
    status,
    created_at,
    resolved_at,
    resolved_by,
    review_notes,
    flagged_suspicious,
    COALESCE(risk_category,
        CASE
            WHEN failure_class = ANY (ARRAY['security', 'critical', 'auth_failure']) THEN 'security'
            WHEN retry_count > 5 THEN 'reliability'
            ELSE 'operational'
        END) AS risk_category
FROM failed_jobs_dlq
WHERE (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 5. rate_limit_stats
DROP VIEW IF EXISTS rate_limit_stats CASCADE;
CREATE VIEW rate_limit_stats WITH (security_invoker = on) AS
SELECT endpoint,
    identifier,
    request_count,
    window_start,
    blocked_until,
    (blocked_until > now()) AS is_blocked
FROM rate_limits rl
WHERE EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() 
      AND ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role])
);

-- 6. circuit_breaker_health (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'circuit_breakers' AND table_schema = 'public') THEN
    EXECUTE 'DROP VIEW IF EXISTS circuit_breaker_health CASCADE';
    EXECUTE '
    CREATE VIEW circuit_breaker_health WITH (security_invoker = on) AS
    SELECT 
      cb.id,
      cb.tenant_id,
      cb.circuit_name,
      cb.state,
      cb.failure_count,
      cb.success_count,
      cb.last_failure_at,
      cb.last_success_at,
      cb.opened_at,
      cb.half_open_at,
      cb.created_at,
      cb.updated_at
    FROM circuit_breakers cb
    WHERE (cb.tenant_id = get_active_tenant_id() OR is_current_super_admin())';
  END IF;
END $$;