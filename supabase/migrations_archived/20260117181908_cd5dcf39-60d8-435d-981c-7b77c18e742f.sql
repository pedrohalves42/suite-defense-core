-- =============================================================================
-- ADR-026 Finalization: Add security_invoker=on to remaining views
-- =============================================================================
-- This migration adds security_invoker=on to 6 views that were identified
-- as missing this critical security attribute.
-- =============================================================================

-- 1. dlq_categorized
DROP VIEW IF EXISTS public.dlq_categorized;
CREATE VIEW public.dlq_categorized WITH (security_invoker = on) AS
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
            WHEN (failure_class = ANY (ARRAY['security'::text, 'critical'::text, 'auth_failure'::text])) THEN 'security'::text
            WHEN (retry_count > 5) THEN 'reliability'::text
            ELSE 'operational'::text
        END) AS risk_category
   FROM failed_jobs_dlq
  WHERE ((tenant_id = public.get_active_tenant_id()) OR public.is_current_super_admin());

-- 2. v_active_risk_debt
DROP VIEW IF EXISTS public.v_active_risk_debt;
CREATE VIEW public.v_active_risk_debt WITH (security_invoker = on) AS
SELECT id,
    tenant_id,
    title,
    description,
    severity,
    risk_accepted_by,
    risk_accepted_at,
    risk_expiry_at,
    risk_justification,
    (EXTRACT(epoch FROM (risk_expiry_at - now())) / (86400)::numeric) AS days_until_expiry,
        CASE
            WHEN (risk_expiry_at <= (now() + '7 days'::interval)) THEN 'expiring_soon'::text
            ELSE 'active'::text
        END AS risk_status
   FROM tasks t
  WHERE ((status = 'accepted_risk'::text) AND ((risk_expiry_at IS NULL) OR (risk_expiry_at > now())));

-- 3. v_agent_archive_reason_tree
DROP VIEW IF EXISTS public.v_agent_archive_reason_tree;
CREATE VIEW public.v_agent_archive_reason_tree WITH (security_invoker = on) AS
SELECT e.id AS event_id,
    e.agent_id,
    a.agent_name,
    a.tenant_id,
    e.reason,
    e.actor_type,
    e.actor_id,
    e.notes,
    e.created_at,
    a.archived_at,
    a.archived_reason
   FROM (agent_archive_events e
     JOIN agents a ON ((a.id = e.agent_id)))
  WHERE (a.archived_at IS NOT NULL)
  ORDER BY e.created_at DESC;

-- 4. v_agent_execution_health
DROP VIEW IF EXISTS public.v_agent_execution_health;
CREATE VIEW public.v_agent_execution_health WITH (security_invoker = on) AS
SELECT a.id AS agent_id,
    a.tenant_id,
    a.agent_name,
    a.status,
    a.last_heartbeat,
    a.agent_mode,
    a.agent_version,
    a.enrolled_at,
        CASE
            WHEN (a.last_heartbeat IS NULL) THEN 'never_seen'::text
            WHEN (a.last_heartbeat < (now() - '00:15:00'::interval)) THEN 'offline'::text
            WHEN (a.last_heartbeat < (now() - '00:05:00'::interval)) THEN 'degraded'::text
            WHEN (a.agent_mode = 'safe_mode'::text) THEN 'safe_mode'::text
            WHEN (le.last_execution_at IS NULL) THEN 'not_executing_jobs'::text
            WHEN (le.last_execution_at < (now() - '02:00:00'::interval)) THEN 'execution_stale'::text
            WHEN (COALESCE(jq.stale_queued, (0)::bigint) >= 3) THEN 'not_polling_jobs'::text
            ELSE 'healthy'::text
        END AS health_status,
    (EXTRACT(epoch FROM (now() - a.last_heartbeat)))::integer AS seconds_since_heartbeat,
    ((EXTRACT(epoch FROM (now() - a.last_heartbeat)) / (60)::numeric))::integer AS minutes_since_heartbeat,
    ((EXTRACT(epoch FROM (now() - le.last_execution_at)) / (60)::numeric))::integer AS minutes_since_execution,
    le.last_execution_at,
    (COALESCE(jq.stale_queued, (0)::bigint))::integer AS stale_queued_jobs,
    (COALESCE(jq.stale_delivered, (0)::bigint))::integer AS stale_delivered_jobs,
    (COALESCE(jq.pending, (0)::bigint))::integer AS pending_jobs
   FROM ((agents a
     LEFT JOIN LATERAL ( SELECT max(je.finished_at) AS last_execution_at
           FROM job_executions je
          WHERE (je.agent_id = a.id)) le ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE ((j.status = 'queued'::text) AND (j.created_at < (now() - '01:00:00'::interval)))) AS stale_queued,
            count(*) FILTER (WHERE ((j.status = 'delivered'::text) AND (j.created_at < (now() - '01:00:00'::interval)))) AS stale_delivered,
            count(*) FILTER (WHERE (j.status = ANY (ARRAY['queued'::text, 'delivered'::text]))) AS pending
           FROM jobs j
          WHERE (j.agent_id = a.id)) jq ON (true))
  WHERE (a.archived_at IS NULL);

-- 5. v_job_execution_health
DROP VIEW IF EXISTS public.v_job_execution_health;
CREATE VIEW public.v_job_execution_health WITH (security_invoker = on) AS
SELECT j.tenant_id,
    count(*) FILTER (WHERE (j.status = 'delivered'::text)) AS delivered_count,
    count(*) FILTER (WHERE (j.status = 'completed'::text)) AS completed_count,
    count(*) FILTER (WHERE (j.status = 'failed'::text)) AS failed_count,
    count(*) FILTER (WHERE ((j.status = 'completed'::text) AND (j.finished_at > j.expires_at))) AS expired_completed_count,
    count(*) FILTER (WHERE (j.id IN ( SELECT je2.job_id
           FROM job_executions je2
          GROUP BY je2.job_id
         HAVING (count(*) > 1)))) AS duplicate_execution_jobs,
    avg(EXTRACT(epoch FROM (j.delivered_at - j.created_at))) AS avg_queue_time_seconds,
    avg(je.execution_time_seconds) FILTER (WHERE (j.status = 'completed'::text)) AS avg_execution_time_seconds,
    now() AS calculated_at
   FROM (jobs j
     LEFT JOIN job_executions je ON ((j.current_execution_id = je.id)))
  WHERE (j.created_at > (now() - '24:00:00'::interval))
  GROUP BY j.tenant_id;

-- 6. v_pipeline_health_metrics
DROP VIEW IF EXISTS public.v_pipeline_health_metrics;
CREATE VIEW public.v_pipeline_health_metrics WITH (security_invoker = on) AS
SELECT date_trunc('hour'::text, created_at) AS hour,
    type,
    count(*) AS total_jobs,
    count(*) FILTER (WHERE (status = 'completed'::text)) AS completed_jobs,
    count(*) FILTER (WHERE (status = 'failed'::text)) AS failed_jobs,
    count(*) FILTER (WHERE (status = 'queued'::text)) AS queued_jobs,
    count(*) FILTER (WHERE (status = 'in_progress'::text)) AS in_progress_jobs,
    round(
        CASE
            WHEN (count(*) > 0) THEN (((count(*) FILTER (WHERE (status = 'completed'::text)))::numeric / (count(*))::numeric) * (100)::numeric)
            ELSE (0)::numeric
        END, 2) AS success_rate,
    count(*) FILTER (WHERE ((status = 'completed'::text) AND (type = 'collect_web_activity'::text) AND (EXISTS ( SELECT 1
           FROM agent_web_activity aw
          WHERE ((aw.agent_id = j.agent_id) AND (aw.created_at >= j.created_at)))))) AS completed_with_data,
    count(*) FILTER (WHERE ((status = 'completed'::text) AND (type = ANY (ARRAY['collect_web_activity'::text, 'software_inventory_collect'::text, 'collect_antivirus_status'::text])) AND (output IS NULL))) AS silent_failures
   FROM jobs j
  WHERE (created_at >= (now() - '24:00:00'::interval))
  GROUP BY (date_trunc('hour'::text, created_at)), type
  ORDER BY (date_trunc('hour'::text, created_at)) DESC;

-- Grant SELECT on views to authenticated users
GRANT SELECT ON public.dlq_categorized TO authenticated;
GRANT SELECT ON public.v_active_risk_debt TO authenticated;
GRANT SELECT ON public.v_agent_archive_reason_tree TO authenticated;
GRANT SELECT ON public.v_agent_execution_health TO authenticated;
GRANT SELECT ON public.v_job_execution_health TO authenticated;
GRANT SELECT ON public.v_pipeline_health_metrics TO authenticated;