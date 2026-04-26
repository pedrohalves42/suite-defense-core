-- =============================================================================
-- PACOTE FINAL DE CORRECOES - Com Tabela Correta
-- =============================================================================

-- =============================================================================
-- FASE A1: Corrigir detect_critical_failure_pattern
-- =============================================================================

DROP FUNCTION IF EXISTS public.detect_critical_failure_pattern(integer, integer);

CREATE FUNCTION public.detect_critical_failure_pattern(
  p_window_minutes integer DEFAULT 30,
  p_min_failures integer DEFAULT 3
)
RETURNS TABLE (
  tenant_id uuid,
  agent_id uuid,
  agent_name text,
  failure_type text,
  failure_count bigint,
  first_seen timestamptz,
  last_seen timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH recent_failures AS (
    SELECT
      je.tenant_id,
      je.agent_id,
      je.agent_name,
      COALESCE(je.exit_code::text, je.error_message, 'unknown') AS fail_type,
      je.created_at AS event_time
    FROM job_executions je
    WHERE je.status = 'error'
      AND je.created_at > NOW() - (p_window_minutes || ' minutes')::interval

    UNION ALL

    SELECT
      j.tenant_id,
      j.agent_id,
      j.agent_name,
      j.type AS fail_type,
      j.completed_at AS event_time
    FROM jobs j
    WHERE j.status = 'failed'
      AND j.completed_at > NOW() - (p_window_minutes || ' minutes')::interval
  )
  SELECT
    rf.tenant_id,
    rf.agent_id,
    rf.agent_name,
    rf.fail_type AS failure_type,
    COUNT(*)::bigint AS failure_count,
    MIN(rf.event_time) AS first_seen,
    MAX(rf.event_time) AS last_seen
  FROM recent_failures rf
  GROUP BY rf.tenant_id, rf.agent_id, rf.agent_name, rf.fail_type
  HAVING COUNT(*) >= p_min_failures;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_critical_failure_pattern(integer, integer) TO service_role;

-- =============================================================================
-- FASE A2: Dropar AMBAS as versoes de check_offline_agents_for_playbook
-- =============================================================================

DROP FUNCTION IF EXISTS public.check_offline_agents_for_playbook();
DROP FUNCTION IF EXISTS public.check_offline_agents_for_playbook(uuid);

CREATE FUNCTION public.check_offline_agents_for_playbook(
  p_tenant_id uuid
)
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  last_heartbeat timestamptz,
  minutes_offline integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS agent_id,
    a.agent_name,
    a.last_heartbeat,
    (EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::integer / 60) AS minutes_offline
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
    AND a.archived_at IS NULL
    AND a.status = 'active'
    AND a.last_heartbeat < NOW() - INTERVAL '15 minutes';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_offline_agents_for_playbook(uuid) TO service_role;

-- =============================================================================
-- FASE A3: Corrigir TRIGGER collect_task_evidence na tabela TASKS (correta)
-- =============================================================================

-- Dropar o trigger existente na tabela correta
DROP TRIGGER IF EXISTS tr_collect_task_evidence ON public.tasks;

-- Dropar a funcao trigger (sem argumentos)
DROP FUNCTION IF EXISTS public.collect_task_evidence();

-- Recriar a funcao trigger corrigida
CREATE FUNCTION public.collect_task_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events jsonb;
  v_source_data jsonb;
BEGIN
  IF NEW.agent_id IS NOT NULL THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', ae.id,
        'event_type', ae.event_type,
        'severity', ae.severity,
        'created_at', ae.created_at
      ) ORDER BY ae.created_at DESC
    )
    INTO v_events
    FROM agent_evidence_logs ae
    WHERE ae.agent_id = NEW.agent_id
      AND ae.created_at > NOW() - INTERVAL '1 hour'
    LIMIT 10;
    
    NEW.related_events := COALESCE(v_events, '[]'::jsonb);
  END IF;

  IF NEW.source_type = 'job' AND NEW.source_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', j.id,
      'type', j.type,
      'status', j.status,
      'priority', j.priority,
      'created_at', j.created_at,
      'completed_at', j.completed_at
    ) INTO v_source_data
    FROM jobs j WHERE j.id = NEW.source_id;
    NEW.source_snapshot := v_source_data;
    
  ELSIF NEW.source_type = 'job_execution' AND NEW.source_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', je.id,
      'status', je.status,
      'exit_code', je.exit_code,
      'error_message', je.error_message,
      'started_at', je.started_at,
      'completed_at', je.completed_at
    ) INTO v_source_data
    FROM job_executions je WHERE je.id = NEW.source_id;
    NEW.source_snapshot := v_source_data;
    
  ELSIF NEW.source_type = 'system_alert' AND NEW.source_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', sa.id,
      'alert_type', sa.alert_type,
      'severity', sa.severity,
      'message', sa.message,
      'resolved', sa.resolved,
      'created_at', sa.created_at
    ) INTO v_source_data
    FROM system_alerts sa WHERE sa.id = NEW.source_id;
    NEW.source_snapshot := v_source_data;
  END IF;

  RETURN NEW;
END;
$$;

-- Recriar o trigger na tabela correta
CREATE TRIGGER tr_collect_task_evidence
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.collect_task_evidence();

-- =============================================================================
-- FASE A4: Recriar views com security_invoker
-- =============================================================================

DROP VIEW IF EXISTS public.v_security_invariants;
DROP VIEW IF EXISTS public.v_cron_silent_failures;
DROP VIEW IF EXISTS public.v_agent_execution_health;

CREATE VIEW public.v_agent_execution_health
WITH (security_invoker = on) AS
SELECT
  a.id AS agent_id,
  a.tenant_id,
  a.agent_name,
  a.status,
  a.last_heartbeat,
  a.agent_mode,
  a.agent_version,
  a.enrolled_at,
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'never_seen'
    WHEN a.last_heartbeat < NOW() - INTERVAL '15 minutes' THEN 'offline'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'degraded'
    ELSE 'healthy'
  END AS health_status,
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::integer AS seconds_since_heartbeat
FROM agents a
WHERE a.archived_at IS NULL;

CREATE VIEW public.v_cron_silent_failures
WITH (security_invoker = on) AS
SELECT
  sj.id,
  sj.name AS job_name,
  sj.job_type,
  sj.job_key,
  sj.cron_expr,
  sj.last_run_at,
  sj.tenant_id,
  max(sjr.ran_at) AS last_successful_run,
  (now() - COALESCE(max(sjr.ran_at), sj.created_at)) AS silence_duration,
  CASE
    WHEN (max(sjr.ran_at) IS NULL) THEN 'NEVER_RAN'
    WHEN (max(sjr.ran_at) < (now() - INTERVAL '2 hours')) THEN 'STALE'
    ELSE 'OK'
  END AS health_status
FROM scheduled_jobs sj
LEFT JOIN scheduled_job_runs sjr ON sj.job_key = sjr.job_key AND sjr.success = true
GROUP BY sj.id, sj.name, sj.job_type, sj.job_key, sj.cron_expr, sj.last_run_at, sj.tenant_id, sj.created_at;

CREATE VIEW public.v_security_invariants
WITH (security_invoker = on) AS
SELECT 
  'PUBLIC_WRITE_POLICIES'::text AS invariant,
  count(*) AS violations,
  CASE
    WHEN (count(*) = 0) THEN 'OK'
    ELSE 'CRITICAL'
  END AS status
FROM pg_policies
WHERE pg_policies.schemaname = 'public'
  AND (pg_policies.roles)::text LIKE '%public%'
  AND (
    (pg_policies.cmd IN ('UPDATE', 'DELETE', 'ALL') AND (pg_policies.qual = 'true' OR pg_policies.qual IS NULL))
    OR (pg_policies.cmd = 'INSERT' AND (pg_policies.with_check = 'true' OR pg_policies.with_check IS NULL))
  );

-- =============================================================================
-- FASE A5: Corrigir RLS permissiva em circuit_breaker_events
-- =============================================================================

DROP POLICY IF EXISTS "System can insert circuit breaker events" ON public.circuit_breaker_events;

CREATE POLICY "Only service role can insert circuit breaker events"
ON public.circuit_breaker_events
FOR INSERT
TO service_role
WITH CHECK (true);

-- =============================================================================
-- COMENTARIOS
-- =============================================================================

COMMENT ON FUNCTION public.detect_critical_failure_pattern(integer, integer) IS 'Fixed: uses exit_code instead of error_code';
COMMENT ON FUNCTION public.check_offline_agents_for_playbook(uuid) IS 'Fixed: uses agent_name, archived_at, last_heartbeat';
COMMENT ON VIEW public.v_agent_execution_health IS 'Fixed: security_invoker = on';
COMMENT ON VIEW public.v_cron_silent_failures IS 'Fixed: security_invoker = on';
COMMENT ON VIEW public.v_security_invariants IS 'Fixed: security_invoker = on';