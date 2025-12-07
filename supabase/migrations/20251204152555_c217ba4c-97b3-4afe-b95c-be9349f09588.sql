-- Fase 1: Limpar todas as enrollment keys expiradas
DELETE FROM public.enrollment_keys 
WHERE expires_at < NOW() AND is_active = false;

-- Fase 2: Atualizar funcao diagnose_agent_issues para verificar apenas key mais recente
CREATE OR REPLACE FUNCTION public.diagnose_agent_issues(p_agent_name text)
 RETURNS TABLE(issue_type text, severity text, description text, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Verificar se agente existe
  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE agent_name = p_agent_name) THEN
    RETURN QUERY SELECT 
      'agent_not_found'::TEXT,
      'critical'::TEXT,
      'Agente nao encontrado no sistema'::TEXT,
      jsonb_build_object('agent_name', p_agent_name);
    RETURN;
  END IF;
  
  -- Verificar heartbeat nunca enviado
  RETURN QUERY
  SELECT 
    'no_heartbeat'::TEXT,
    'critical'::TEXT,
    'Agente nunca enviou heartbeat'::TEXT,
    jsonb_build_object(
      'agent_name', p_agent_name,
      'enrolled_at', a.enrolled_at,
      'status', a.status
    )
  FROM public.agents a
  WHERE a.agent_name = p_agent_name 
    AND a.last_heartbeat IS NULL;
  
  -- Verificar heartbeat antigo (>5min)
  RETURN QUERY
  SELECT 
    'stale_heartbeat'::TEXT,
    'high'::TEXT,
    'Ultimo heartbeat ha mais de 5 minutos'::TEXT,
    jsonb_build_object(
      'agent_name', p_agent_name,
      'last_heartbeat', a.last_heartbeat,
      'minutes_ago', EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER / 60
    )
  FROM public.agents a
  WHERE a.agent_name = p_agent_name 
    AND a.last_heartbeat IS NOT NULL
    AND a.last_heartbeat < NOW() - INTERVAL '5 minutes';
  
  -- Verificar token invalido/expirado
  RETURN QUERY
  SELECT 
    'invalid_token'::TEXT,
    'critical'::TEXT,
    'Nenhum token ativo encontrado para este agente'::TEXT,
    jsonb_build_object(
      'agent_name', p_agent_name,
      'agent_id', a.id
    )
  FROM public.agents a
  WHERE a.agent_name = p_agent_name 
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_tokens at 
      WHERE at.agent_id = a.id 
        AND at.is_active = true 
        AND (at.expires_at IS NULL OR at.expires_at > NOW())
    );
  
  -- Verificar jobs travados
  RETURN QUERY
  SELECT 
    'stuck_jobs'::TEXT,
    'medium'::TEXT,
    'Jobs em estado "delivered" ha mais de 1 hora sem conclusao'::TEXT,
    jsonb_build_object(
      'agent_name', p_agent_name,
      'stuck_job_count', COUNT(*)
    )
  FROM public.jobs j
  WHERE j.agent_name = p_agent_name 
    AND j.status = 'delivered'
    AND j.delivered_at < NOW() - INTERVAL '1 hour'
  GROUP BY j.agent_name
  HAVING COUNT(*) > 0;
  
  -- Verificar metricas ausentes nas ultimas 24 horas (nao apenas existencia)
  RETURN QUERY
  SELECT 
    'no_metrics'::TEXT,
    'medium'::TEXT,
    'Nenhuma metrica de sistema registrada nas ultimas 24 horas'::TEXT,
    jsonb_build_object(
      'agent_name', p_agent_name,
      'agent_id', a.id
    )
  FROM public.agents a
  WHERE a.agent_name = p_agent_name 
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_system_metrics m 
      WHERE m.agent_id = a.id
        AND m.collected_at > NOW() - INTERVAL '24 hours'
    );
    
  -- Verificar APENAS a enrollment key MAIS RECENTE (nao todas as antigas)
  RETURN QUERY
  SELECT 
    'enrollment_key_expired'::TEXT,
    'info'::TEXT,
    'Enrollment key mais recente estava expirado ou inativo'::TEXT,
    jsonb_build_object(
      'agent_name', p_agent_name,
      'key_info', jsonb_build_object(
        'expires_at', ek.expires_at,
        'is_active', ek.is_active,
        'used_at', ek.used_at
      )
    )
  FROM public.agents a
  JOIN public.enrollment_keys ek ON ek.used_by_agent = a.agent_name
  WHERE a.agent_name = p_agent_name 
    AND (ek.expires_at < NOW() OR NOT ek.is_active)
    AND ek.created_at = (
      SELECT MAX(ek2.created_at) 
      FROM public.enrollment_keys ek2 
      WHERE ek2.used_by_agent = a.agent_name
    );
  
  RETURN;
END;
$function$;