
-- Fix diagnose_agent_issues to show REAL current problems, not raw historical logs
CREATE OR REPLACE FUNCTION public.diagnose_agent_issues(
  p_agent_name text,
  p_tenant_id uuid
)
RETURNS TABLE(
  issue_type text,
  severity text,
  message text,
  details jsonb,
  detected_at timestamptz,
  origin text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent record;
BEGIN
  -- Buscar agente
  SELECT a.id, a.status, a.agent_version, a.last_heartbeat, a.os_type,
         a.force_update_version, a.scheduling_paused, a.scheduling_paused_reason,
         a.archived_at,
         EXTRACT(EPOCH FROM (now() - a.last_heartbeat))/60 as minutes_offline
  INTO v_agent
  FROM agents a
  WHERE a.agent_name = p_agent_name 
    AND a.tenant_id = p_tenant_id;
  
  IF v_agent IS NULL THEN
    RETURN QUERY SELECT 
      'agent_not_found'::text, 'critical'::text,
      'Agente nao encontrado no sistema'::text,
      jsonb_build_object('agent_name', p_agent_name),
      now(), 'system'::text;
    RETURN;
  END IF;
  
  IF v_agent.archived_at IS NOT NULL THEN
    RETURN QUERY SELECT 
      'agent_archived'::text, 'info'::text,
      'Agente esta arquivado'::text,
      jsonb_build_object('agent_id', v_agent.id),
      now(), 'system'::text;
    RETURN;
  END IF;

  -- 1. STATUS: Agente offline
  IF v_agent.minutes_offline > 10 THEN
    RETURN QUERY SELECT
      'agent_offline'::text,
      CASE WHEN v_agent.minutes_offline > 1440 THEN 'critical' 
           WHEN v_agent.minutes_offline > 120 THEN 'high'
           ELSE 'medium' END,
      'Sem comunicacao ha ' || 
        CASE WHEN v_agent.minutes_offline > 1440 
          THEN round(v_agent.minutes_offline / 1440) || ' dia(s)'
          WHEN v_agent.minutes_offline > 60 
          THEN round(v_agent.minutes_offline / 60) || ' hora(s)'
          ELSE round(v_agent.minutes_offline) || ' minutos'
        END,
      jsonb_build_object(
        'last_heartbeat', v_agent.last_heartbeat,
        'minutes_offline', round(v_agent.minutes_offline)
      ),
      v_agent.last_heartbeat, 'system'::text;
  END IF;

  -- 2. VERSION: Versao desatualizada
  IF v_agent.agent_version IS NOT NULL THEN
    DECLARE
      v_latest_version text;
    BEGIN
      SELECT ar.version INTO v_latest_version
      FROM agent_releases ar
      WHERE ar.platform = COALESCE(v_agent.os_type, 'windows')
        AND ar.is_active = true
      ORDER BY ar.created_at DESC LIMIT 1;
      
      IF v_latest_version IS NOT NULL AND v_agent.agent_version != v_latest_version THEN
        RETURN QUERY SELECT
          'outdated_version'::text,
          CASE WHEN v_agent.force_update_version IS NOT NULL THEN 'medium' ELSE 'high' END,
          'Versao ' || v_agent.agent_version || ' desatualizada (atual: ' || v_latest_version || ')' ||
            CASE WHEN v_agent.force_update_version IS NOT NULL 
              THEN ' ? atualizacao forcada pendente' ELSE '' END,
          jsonb_build_object(
            'current_version', v_agent.agent_version,
            'latest_version', v_latest_version,
            'force_update_pending', v_agent.force_update_version IS NOT NULL
          ),
          now(), 'system'::text;
      END IF;
    END;
  END IF;

  -- 3. SCHEDULING: Agendamento pausado
  IF v_agent.scheduling_paused = true THEN
    RETURN QUERY SELECT
      'scheduling_paused'::text, 'info'::text,
      'Agendamento de jobs pausado' || COALESCE(': ' || v_agent.scheduling_paused_reason, ''),
      jsonb_build_object('reason', v_agent.scheduling_paused_reason),
      now(), 'system'::text;
  END IF;

  -- 4. JOBS: Jobs falhados recentes (ultimas 24h, agrupados por tipo)
  RETURN QUERY
  SELECT
    'failed_job'::text,
    CASE WHEN j_grouped.fail_count > 3 THEN 'high' ELSE 'medium' END,
    j_grouped.job_type || ' falhou ' || j_grouped.fail_count || 'x nas ultimas 24h' ||
      COALESCE(' ? ' || j_grouped.last_error, ''),
    jsonb_build_object(
      'job_type', j_grouped.job_type,
      'fail_count', j_grouped.fail_count,
      'last_failure', j_grouped.last_failure
    ),
    j_grouped.last_failure,
    'jobs'::text
  FROM (
    SELECT 
      j.job_type,
      COUNT(*) as fail_count,
      MAX(j.updated_at) as last_failure,
      (array_agg(j.error_message ORDER BY j.updated_at DESC))[1] as last_error
    FROM jobs j
    WHERE j.agent_id = v_agent.id
      AND j.status IN ('failed', 'dlq', 'exhausted')
      AND j.updated_at > now() - interval '24 hours'
    GROUP BY j.job_type
    HAVING COUNT(*) >= 2
  ) j_grouped;

  -- 5. SECURITY: Eventos de seguranca criticos recentes (ultimas 48h, deduplicados)
  RETURN QUERY
  SELECT DISTINCT ON (e.event_type, e.event_data->>'component', e.event_data->>'root_cause')
    e.event_type,
    e.severity,
    CASE e.event_type
      WHEN 'security_event' THEN
        'Evento de seguranca: ' || COALESCE(e.event_data->>'component', 'sistema')
      WHEN 'service_stopped' THEN
        'Servico ' || COALESCE(e.event_data->>'service_name', 'desconhecido') || ' parado'
      ELSE
        COALESCE(e.event_data->>'message', e.event_data->>'error_message', 
                 'Evento: ' || replace(e.event_type, '_', ' '))
    END,
    e.event_data,
    e.created_at,
    'evidence_logs'::text
  FROM agent_evidence_logs e
  WHERE e.agent_id = v_agent.id
    AND e.severity IN ('critical', 'error')
    AND e.created_at > now() - interval '48 hours'
    AND e.event_type NOT IN ('heartbeat', 'state_change', 'policy_drift', 'policy_sync')
  ORDER BY e.event_type, e.event_data->>'component', e.event_data->>'root_cause', e.created_at DESC;

  -- 6. INFO: Status geral se tudo OK
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'agent_healthy'::text, 'info'::text,
      'Agente operando normalmente'::text,
      jsonb_build_object(
        'version', v_agent.agent_version,
        'status', v_agent.status,
        'last_heartbeat', v_agent.last_heartbeat
      ),
      now(), 'system'::text;
  END IF;
END;
$$;
