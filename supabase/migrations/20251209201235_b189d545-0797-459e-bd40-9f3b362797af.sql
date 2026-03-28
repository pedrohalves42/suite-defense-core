-- P1 Correcao: Funcao diagnose_agent_issues() com validacao de tenant
-- Recriar com parametro p_tenant_id obrigatorio para prevenir cross-tenant leakage

DROP FUNCTION IF EXISTS public.diagnose_agent_issues(text);

CREATE OR REPLACE FUNCTION public.diagnose_agent_issues(p_agent_name text, p_tenant_id uuid)
RETURNS TABLE(issue_type text, severity text, description text, details jsonb)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Validar que o tenant_id pertence ao usuario autenticado
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
      AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: user does not have access to this tenant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Verificar se agente existe no tenant especificado
  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE agent_name = p_agent_name AND tenant_id = p_tenant_id) THEN
    RETURN QUERY SELECT 
      'agent_not_found'::TEXT,
      'critical'::TEXT,
      'Agente nao encontrado no sistema'::TEXT,
      jsonb_build_object('agent_name', p_agent_name, 'tenant_id', p_tenant_id);
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
    AND a.tenant_id = p_tenant_id
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
    AND a.tenant_id = p_tenant_id
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
    AND a.tenant_id = p_tenant_id
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
  
  -- Verificar metricas ausentes nas ultimas 24 horas
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
    AND a.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_system_metrics m 
      WHERE m.agent_id = a.id
        AND m.collected_at > NOW() - INTERVAL '24 hours'
    );
    
  -- Verificar enrollment key mais recente expirada
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
  JOIN public.enrollment_keys ek ON ek.used_by_agent = a.agent_name AND ek.tenant_id = a.tenant_id
  WHERE a.agent_name = p_agent_name 
    AND a.tenant_id = p_tenant_id
    AND (ek.expires_at < NOW() OR NOT ek.is_active)
    AND ek.created_at = (
      SELECT MAX(ek2.created_at) 
      FROM public.enrollment_keys ek2 
      WHERE ek2.used_by_agent = a.agent_name
        AND ek2.tenant_id = a.tenant_id
    );
  
  RETURN;
END;
$function$;

-- P1 Correcao: Adicionar colunas para bloqueio progressivo de IP
ALTER TABLE public.failed_login_attempts 
ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS block_count INTEGER DEFAULT 0;

-- Criar funcao de verificacao e bloqueio progressivo de IP
CREATE OR REPLACE FUNCTION public.check_and_block_ip(p_ip_address TEXT, p_email TEXT DEFAULT NULL)
RETURNS TABLE(
  is_blocked BOOLEAN,
  blocked_until TIMESTAMP WITH TIME ZONE,
  attempt_count INTEGER,
  block_level INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt_count INTEGER;
  v_block_count INTEGER;
  v_blocked_until TIMESTAMP WITH TIME ZONE;
  v_new_block_duration INTERVAL;
BEGIN
  -- Verificar se IP esta na blocklist
  SELECT ip.blocked_until INTO v_blocked_until
  FROM public.ip_blocklist ip
  WHERE ip.ip_address = p_ip_address
    AND ip.blocked_until > NOW();
  
  IF v_blocked_until IS NOT NULL THEN
    RETURN QUERY SELECT true, v_blocked_until, 0, 99;
    RETURN;
  END IF;
  
  -- Contar tentativas nos ultimos 15 minutos
  SELECT COUNT(*), COALESCE(MAX(block_count), 0)
  INTO v_attempt_count, v_block_count
  FROM public.failed_login_attempts
  WHERE ip_address = p_ip_address
    AND created_at > NOW() - INTERVAL '15 minutes';
  
  -- Bloqueio progressivo: 5 tentativas = 5min, 10 = 15min, 15+ = 60min
  IF v_attempt_count >= 15 THEN
    v_new_block_duration := INTERVAL '60 minutes';
  ELSIF v_attempt_count >= 10 THEN
    v_new_block_duration := INTERVAL '15 minutes';
  ELSIF v_attempt_count >= 5 THEN
    v_new_block_duration := INTERVAL '5 minutes';
  ELSE
    -- Nao bloquear ainda
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, v_attempt_count, 0;
    RETURN;
  END IF;
  
  -- Aplicar bloqueio
  v_blocked_until := NOW() + v_new_block_duration;
  
  INSERT INTO public.ip_blocklist (ip_address, blocked_until, reason)
  VALUES (p_ip_address, v_blocked_until, 'Bloqueio progressivo por tentativas de login')
  ON CONFLICT (ip_address) DO UPDATE SET 
    blocked_until = v_blocked_until,
    reason = 'Bloqueio progressivo por tentativas de login';
  
  -- Atualizar contador de bloqueios nas tentativas
  UPDATE public.failed_login_attempts
  SET block_count = v_block_count + 1,
      blocked_until = v_blocked_until
  WHERE ip_address = p_ip_address
    AND created_at > NOW() - INTERVAL '15 minutes';
  
  -- Log de seguranca
  INSERT INTO public.security_logs (
    ip_address,
    endpoint,
    attack_type,
    severity,
    blocked,
    details,
    user_agent
  ) VALUES (
    p_ip_address,
    '/auth/login',
    'brute_force',
    CASE 
      WHEN v_attempt_count >= 15 THEN 'critical'
      WHEN v_attempt_count >= 10 THEN 'high'
      ELSE 'medium'
    END,
    true,
    jsonb_build_object(
      'email', p_email,
      'attempt_count', v_attempt_count,
      'block_duration_minutes', EXTRACT(EPOCH FROM v_new_block_duration) / 60,
      'blocked_until', v_blocked_until
    ),
    NULL
  );
  
  RETURN QUERY SELECT true, v_blocked_until, v_attempt_count, 
    CASE 
      WHEN v_attempt_count >= 15 THEN 3
      WHEN v_attempt_count >= 10 THEN 2
      ELSE 1
    END;
END;
$function$;

-- Indice para melhorar performance de consultas de bloqueio
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_ip_created 
ON public.failed_login_attempts(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_blocked_until 
ON public.failed_login_attempts(blocked_until) 
WHERE blocked_until IS NOT NULL;