
-- FIX 1: Drop and recreate v_agent_execution_health with severity column
DROP VIEW IF EXISTS public.v_agent_execution_health CASCADE;

CREATE VIEW public.v_agent_execution_health
WITH (security_invoker = on, security_barrier = true) AS
SELECT a.id AS agent_id,
    a.tenant_id,
    a.agent_name,
    a.status,
    a.last_heartbeat,
    a.agent_mode,
    a.agent_version,
    a.enrolled_at,
    CASE
        WHEN a.last_heartbeat IS NULL THEN 'never_seen'
        WHEN a.last_heartbeat < (now() - interval '15 minutes') THEN 'offline'
        WHEN a.last_heartbeat < (now() - interval '5 minutes') THEN 'degraded'
        WHEN a.agent_mode = 'safe_mode' THEN 'safe_mode'
        WHEN le.last_execution_at IS NULL THEN 'not_executing_jobs'
        WHEN le.last_execution_at < (now() - interval '2 hours') THEN 'execution_stale'
        WHEN COALESCE(jq.stale_queued, 0) >= 3 THEN 'not_polling_jobs'
        ELSE 'healthy'
    END AS health_status,
    CASE
        WHEN a.last_heartbeat IS NULL THEN 'critical'
        WHEN a.last_heartbeat < (now() - interval '15 minutes') THEN 'critical'
        WHEN a.last_heartbeat < (now() - interval '5 minutes') THEN 'high'
        WHEN a.agent_mode = 'safe_mode' THEN 'high'
        WHEN COALESCE(jq.stale_queued, 0) >= 3 THEN 'medium'
        WHEN le.last_execution_at IS NULL THEN 'low'
        WHEN le.last_execution_at < (now() - interval '2 hours') THEN 'medium'
        ELSE 'none'
    END AS severity,
    CASE
        WHEN a.last_heartbeat IS NULL THEN 'Agente nunca enviou heartbeat'
        WHEN a.last_heartbeat < (now() - interval '15 minutes') THEN 'Agente offline ha mais de 15 minutos'
        WHEN a.last_heartbeat < (now() - interval '5 minutes') THEN 'Agente com comunicacao degradada'
        WHEN a.agent_mode = 'safe_mode' THEN 'Agente em modo seguro'
        WHEN COALESCE(jq.stale_queued, 0) >= 3 THEN 'Jobs acumulados sem processamento'
        WHEN le.last_execution_at IS NULL THEN 'Nenhum job executado ainda'
        WHEN le.last_execution_at < (now() - interval '2 hours') THEN 'Execucao de jobs estagnada'
        ELSE 'Agente saudavel'
    END AS health_description,
    now() AS checked_at,
    EXTRACT(epoch FROM now() - a.last_heartbeat)::integer AS seconds_since_heartbeat,
    (EXTRACT(epoch FROM now() - a.last_heartbeat) / 60)::integer AS minutes_since_heartbeat,
    (EXTRACT(epoch FROM now() - le.last_execution_at) / 60)::integer AS minutes_since_execution,
    le.last_execution_at,
    COALESCE(jq.stale_queued, 0)::integer AS stale_queued_jobs,
    COALESCE(jq.stale_delivered, 0)::integer AS stale_delivered_jobs,
    COALESCE(jq.pending, 0)::integer AS pending_jobs
FROM agents a
LEFT JOIN LATERAL (
    SELECT max(je.finished_at) AS last_execution_at
    FROM job_executions je
    WHERE je.agent_id = a.id
) le ON true
LEFT JOIN LATERAL (
    SELECT 
        count(*) FILTER (WHERE j.status = 'queued' AND j.created_at < (now() - interval '1 hour')) AS stale_queued,
        count(*) FILTER (WHERE j.status = 'delivered' AND j.created_at < (now() - interval '1 hour')) AS stale_delivered,
        count(*) FILTER (WHERE j.status IN ('queued', 'delivered')) AS pending
    FROM jobs j
    WHERE j.agent_id = a.id
) jq ON true
WHERE a.archived_at IS NULL 
  AND auth.uid() IS NOT NULL 
  AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- Secure the view
REVOKE ALL ON public.v_agent_execution_health FROM anon;
GRANT SELECT ON public.v_agent_execution_health TO authenticated;

-- FIX 2: Drop and recreate v_problematic_agents with enrolled_at
DROP VIEW IF EXISTS public.v_problematic_agents CASCADE;

CREATE VIEW public.v_problematic_agents
WITH (security_invoker = on, security_barrier = true) AS
SELECT id,
    tenant_id,
    agent_name,
    display_name,
    hostname,
    status,
    agent_state,
    last_heartbeat,
    agent_version,
    enrolled_at,
    is_isolated,
    isolation_reason,
    CASE
        WHEN is_isolated THEN 'isolated'
        WHEN agent_state = 'safe_mode' THEN 'safe_mode'
        WHEN last_heartbeat < (now() - interval '1 hour') THEN 'offline'
        WHEN last_heartbeat < (now() - interval '15 minutes') THEN 'degraded'
        ELSE 'unknown'
    END AS problem_type,
    GREATEST(last_heartbeat, isolated_at, agent_state_changed_at) AS problem_since
FROM agents
WHERE archived_at IS NULL 
  AND (is_isolated OR agent_state = 'safe_mode' OR last_heartbeat < (now() - interval '15 minutes'))
  AND auth.uid() IS NOT NULL 
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- Secure the view
REVOKE ALL ON public.v_problematic_agents FROM anon;
GRANT SELECT ON public.v_problematic_agents TO authenticated;

-- FIX 3: Set default for last_execution_hash to prevent NOT NULL violations
ALTER TABLE public.agent_execution_chain 
  ALTER COLUMN last_execution_hash SET DEFAULT encode(sha256('genesis'::bytea), 'hex');

-- Backfill any NULL values
UPDATE public.agent_execution_chain 
SET last_execution_hash = encode(sha256('genesis'::bytea), 'hex')
WHERE last_execution_hash IS NULL OR last_execution_hash = '';
