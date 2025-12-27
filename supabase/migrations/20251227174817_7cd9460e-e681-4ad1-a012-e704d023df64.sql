-- Fix: Recriar view com SECURITY INVOKER para usar permissões do usuário que consulta
DROP VIEW IF EXISTS public.v_agent_execution_health;

CREATE VIEW public.v_agent_execution_health 
WITH (security_invoker = true) AS
SELECT 
  a.id as agent_id,
  a.agent_name,
  a.tenant_id,
  a.status,
  a.last_heartbeat,
  a.agent_mode,
  a.agent_version,
  
  -- Métricas de heartbeat
  ROUND(EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))/60) as minutes_since_heartbeat,
  
  -- Última execução
  je.last_execution_at,
  ROUND(EXTRACT(EPOCH FROM (NOW() - je.last_execution_at))/60) as minutes_since_execution,
  
  -- Jobs acumulados problemáticos
  COALESCE(stale_q.stale_queued_jobs, 0) as stale_queued_jobs,
  COALESCE(stale_d.stale_delivered_jobs, 0) as stale_delivered_jobs,
  
  -- Total de jobs pendentes
  COALESCE(pending.pending_jobs, 0) as pending_jobs,
  
  -- Diagnóstico de saúde
  CASE 
    WHEN a.last_heartbeat IS NULL THEN 'never_connected'
    WHEN a.last_heartbeat < NOW() - INTERVAL '30 minutes' THEN 'offline'
    WHEN a.agent_mode = 'SAFE_MODE' THEN 'safe_mode'
    WHEN COALESCE(stale_q.stale_queued_jobs, 0) > 3 THEN 'not_polling_jobs'
    WHEN COALESCE(stale_d.stale_delivered_jobs, 0) > 2 THEN 'not_executing_jobs'
    WHEN je.last_execution_at IS NOT NULL 
         AND je.last_execution_at < NOW() - INTERVAL '4 hours'
         AND COALESCE(pending.pending_jobs, 0) > 0 THEN 'execution_stale'
    ELSE 'healthy'
  END as health_status,
  
  -- Severidade do problema
  CASE 
    WHEN a.last_heartbeat IS NULL THEN 'critical'
    WHEN a.last_heartbeat < NOW() - INTERVAL '30 minutes' THEN 'high'
    WHEN COALESCE(stale_q.stale_queued_jobs, 0) > 10 THEN 'critical'
    WHEN COALESCE(stale_q.stale_queued_jobs, 0) > 5 THEN 'high'
    WHEN COALESCE(stale_q.stale_queued_jobs, 0) > 3 THEN 'medium'
    WHEN COALESCE(stale_d.stale_delivered_jobs, 0) > 2 THEN 'medium'
    ELSE 'low'
  END as severity,
  
  -- Descrição do problema
  CASE 
    WHEN a.last_heartbeat IS NULL THEN 'Agente nunca conectou ao sistema'
    WHEN a.last_heartbeat < NOW() - INTERVAL '30 minutes' THEN 'Agente offline há mais de 30 minutos'
    WHEN a.agent_mode = 'SAFE_MODE' THEN 'Agente em modo seguro - execução limitada'
    WHEN COALESCE(stale_q.stale_queued_jobs, 0) > 3 THEN 'Agente online mas não está buscando jobs há mais de 1 hora'
    WHEN COALESCE(stale_d.stale_delivered_jobs, 0) > 2 THEN 'Agente recebeu jobs mas não está executando há mais de 30 minutos'
    WHEN je.last_execution_at IS NOT NULL 
         AND je.last_execution_at < NOW() - INTERVAL '4 hours'
         AND COALESCE(pending.pending_jobs, 0) > 0 THEN 'Última execução há mais de 4 horas com jobs pendentes'
    ELSE 'Agente funcionando normalmente'
  END as health_description,
  
  NOW() as checked_at

FROM public.agents a

-- Última execução de job
LEFT JOIN LATERAL (
  SELECT MAX(je.finished_at) as last_execution_at
  FROM public.job_executions je
  WHERE je.agent_id = a.id
) je ON true

-- Jobs queued há mais de 1 hora
LEFT JOIN LATERAL (
  SELECT COUNT(*) as stale_queued_jobs
  FROM public.jobs j
  WHERE j.agent_id = a.id 
    AND j.status = 'queued' 
    AND j.created_at < NOW() - INTERVAL '1 hour'
) stale_q ON true

-- Jobs delivered há mais de 30 minutos
LEFT JOIN LATERAL (
  SELECT COUNT(*) as stale_delivered_jobs
  FROM public.jobs j
  WHERE j.agent_id = a.id 
    AND j.status = 'delivered' 
    AND j.delivered_at < NOW() - INTERVAL '30 minutes'
) stale_d ON true

-- Total de jobs pendentes
LEFT JOIN LATERAL (
  SELECT COUNT(*) as pending_jobs
  FROM public.jobs j
  WHERE j.agent_id = a.id 
    AND j.status IN ('queued', 'delivered')
) pending ON true

WHERE a.status = 'active';

-- Comentário na view
COMMENT ON VIEW public.v_agent_execution_health IS 
'View SECURITY INVOKER que identifica agentes com problemas de execução. Usa permissões do usuário que consulta.';