-- ==========================================
-- FASE 3: CORREÇÕES DE BANCO DE DADOS
-- ==========================================

-- 1. Limpar agentes "pending" órfãos sem heartbeat há mais de 24h
-- Estes são agentes que nunca se conectaram e estão poluindo o sistema
DELETE FROM public.agents 
WHERE status = 'pending' 
  AND last_heartbeat IS NULL 
  AND enrolled_at < NOW() - INTERVAL '24 hours';

-- 2. Corrigir inconsistências em enrollment_keys
-- Marcar como inativas keys expiradas que ainda estão ativas
UPDATE public.enrollment_keys
SET is_active = false
WHERE expires_at < NOW() 
  AND is_active = true;

-- Corrigir keys com current_uses > 0 mas sem used_at
UPDATE public.enrollment_keys
SET used_at = NOW()
WHERE current_uses > 0 
  AND used_at IS NULL;

-- 3. Adicionar índices de performance para queries frequentes
CREATE INDEX IF NOT EXISTS idx_agents_last_heartbeat 
ON public.agents(last_heartbeat DESC) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_agents_tenant_status 
ON public.agents(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_enrollment_keys_active_expires 
ON public.enrollment_keys(is_active, expires_at) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_jobs_agent_status_created 
ON public.jobs(agent_name, status, created_at) 
WHERE status IN ('queued', 'delivered');

CREATE INDEX IF NOT EXISTS idx_agent_system_metrics_agent_collected 
ON public.agent_system_metrics(agent_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_logs_tenant_created 
ON public.security_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_ip_created 
ON public.failed_login_attempts(ip_address, created_at DESC);

-- 4. Criar função para limpar dados antigos automaticamente
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Limpar rate_limits antigos (>1h)
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '1 hour';
  
  -- Limpar hmac_signatures antigos (>5min)
  DELETE FROM public.hmac_signatures
  WHERE used_at < NOW() - INTERVAL '5 minutes';
  
  -- Limpar failed_login_attempts antigos (>24h)
  DELETE FROM public.failed_login_attempts
  WHERE created_at < NOW() - INTERVAL '24 hours';
  
  -- Limpar ip_blocklist expirados
  DELETE FROM public.ip_blocklist
  WHERE blocked_until < NOW();
  
  -- Limpar métricas antigas (>30 dias)
  DELETE FROM public.agent_system_metrics
  WHERE collected_at < NOW() - INTERVAL '30 days';
  
  -- Limpar security_logs antigos (>90 dias)
  DELETE FROM public.security_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  RAISE NOTICE 'Limpeza de dados antigos concluída em %', NOW();
END;
$$;

-- 5. Criar view segura para monitoramento de agentes
CREATE OR REPLACE VIEW public.agents_health_view
WITH (security_invoker = true)
AS
SELECT 
  a.id,
  a.tenant_id,
  a.agent_name,
  a.status,
  a.enrolled_at,
  a.last_heartbeat,
  a.os_type,
  a.os_version,
  a.hostname,
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER / 60 AS minutes_since_heartbeat,
  CASE 
    WHEN a.last_heartbeat IS NULL THEN 'never_connected'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'offline'
    WHEN a.last_heartbeat < NOW() - INTERVAL '2 minutes' THEN 'warning'
    ELSE 'online'
  END AS health_status,
  (SELECT COUNT(*) FROM public.jobs WHERE agent_name = a.agent_name AND status = 'queued') AS pending_jobs,
  (SELECT COUNT(*) FROM public.jobs WHERE agent_name = a.agent_name AND status = 'completed') AS completed_jobs
FROM public.agents a;

-- 6. Criar função para diagnóstico de problemas comuns
CREATE OR REPLACE FUNCTION public.diagnose_agent_issues(p_agent_name TEXT)
RETURNS TABLE(
  issue_type TEXT,
  severity TEXT,
  description TEXT,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Verificar se agente existe
  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE agent_name = p_agent_name) THEN
    RETURN QUERY SELECT 
      'agent_not_found'::TEXT,
      'critical'::TEXT,
      'Agente não encontrado no sistema'::TEXT,
      jsonb_build_object('agent_name', p_agent_name);
    RETURN;
  END IF;
  
  -- Verificar heartbeat
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
    'Último heartbeat há mais de 5 minutos'::TEXT,
    jsonb_build_object(
      'agent_name', p_agent_name,
      'last_heartbeat', a.last_heartbeat,
      'minutes_ago', EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER / 60
    )
  FROM public.agents a
  WHERE a.agent_name = p_agent_name 
    AND a.last_heartbeat < NOW() - INTERVAL '5 minutes';
  
  -- Verificar token inválido/expirado
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
    'Jobs em estado "delivered" há mais de 1 hora sem conclusão'::TEXT,
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
  
  -- Verificar métricas ausentes
  RETURN QUERY
  SELECT 
    'no_metrics'::TEXT,
    'medium'::TEXT,
    'Nenhuma métrica de sistema registrada'::TEXT,
    jsonb_build_object(
      'agent_name', p_agent_name,
      'agent_id', a.id
    )
  FROM public.agents a
  WHERE a.agent_name = p_agent_name 
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_system_metrics m 
      WHERE m.agent_id = a.id
    );
    
  -- Verificar enrollment key expirado
  RETURN QUERY
  SELECT 
    'enrollment_key_expired'::TEXT,
    'info'::TEXT,
    'Enrollment key utilizado estava expirado ou inativo'::TEXT,
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
    AND (ek.expires_at < NOW() OR NOT ek.is_active);
  
  -- Se não há issues, retornar OK
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      'healthy'::TEXT,
      'info'::TEXT,
      'Nenhum problema detectado com este agente'::TEXT,
      jsonb_build_object('agent_name', p_agent_name);
  END IF;
END;
$$;

-- 7. Comentários para documentação
COMMENT ON FUNCTION public.cleanup_old_data() IS 'Limpa dados antigos de rate_limits, hmac_signatures, failed_login_attempts, ip_blocklist, métricas e security logs';
COMMENT ON FUNCTION public.diagnose_agent_issues(TEXT) IS 'Diagnostica problemas comuns com um agente específico';
COMMENT ON VIEW public.agents_health_view IS 'View de monitoramento de saúde dos agentes com status em tempo real';