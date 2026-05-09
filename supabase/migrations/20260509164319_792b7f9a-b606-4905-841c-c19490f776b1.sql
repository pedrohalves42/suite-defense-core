-- 1. Harden diagnose_agent to prevent cross-tenant bypass
CREATE OR REPLACE FUNCTION public.diagnose_agent(p_agent_name text, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_agent RECORD;
  v_token_info RECORD;
  v_jobs_info RECORD;
  v_issues jsonb[] := '{}';
  v_effective_tenant_id uuid;
  v_is_super_admin boolean;
BEGIN
  -- Security: Only super admins can override p_tenant_id
  -- For regular users, we ALWAYS ignore p_tenant_id and use their own context
  SELECT is_super_admin INTO v_is_super_admin FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin' LIMIT 1;
  v_is_super_admin := COALESCE(v_is_super_admin, false);

  IF v_is_super_admin AND p_tenant_id IS NOT NULL THEN
    v_effective_tenant_id := p_tenant_id;
  ELSE
    SELECT tenant_id INTO v_effective_tenant_id 
    FROM user_roles 
    WHERE user_id = auth.uid() 
    LIMIT 1;
  END IF;
  
  IF v_effective_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Acesso negado ou contexto de tenant ausente'
    );
  END IF;

  -- Buscar agente filtrando por tenant (ESSENCIAL)
  SELECT * INTO v_agent
  FROM agents
  WHERE agent_name = p_agent_name
    AND tenant_id = v_effective_tenant_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agente nao encontrado no seu tenant',
      'agent_name', p_agent_name
    );
  END IF;
  
  -- ... keep original diagnostic logic (token, heartbeat, jobs)
  SELECT 
    COUNT(*) as total_tokens,
    COUNT(*) FILTER (WHERE is_active = true) as active_tokens,
    MAX(created_at) as last_token_created
  INTO v_token_info
  FROM agent_tokens
  WHERE agent_id = v_agent.id;
  
  IF v_token_info.active_tokens = 0 THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'no_active_token',
      'severity', 'critical',
      'message', 'Nenhum token ativo encontrado para este agente'
    );
  END IF;
  
  IF v_agent.last_heartbeat IS NULL THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'never_connected',
      'severity', 'critical',
      'message', 'Agente nunca enviou batimento (heartbeat)',
      'enrolled_at', v_agent.enrolled_at
    );
  ELSIF v_agent.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'stale_heartbeat',
      'severity', 'high',
      'message', 'Ultimo batimento ha mais de 10 minutos',
      'last_heartbeat', v_agent.last_heartbeat,
      'minutes_ago', EXTRACT(EPOCH FROM (NOW() - v_agent.last_heartbeat)) / 60
    );
  END IF;
  
  SELECT 
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'queued') as queued_jobs,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs
  INTO v_jobs_info
  FROM jobs
  WHERE agent_id = v_agent.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'agent', jsonb_build_object(
      'id', v_agent.id,
      'name', v_agent.agent_name,
      'status', v_agent.status,
      'os_type', v_agent.os_type
    ),
    'tokens', v_token_info,
    'jobs', v_jobs_info,
    'issues', v_issues,
    'is_healthy', array_length(v_issues, 1) IS NULL
  );
END;
$function$;

-- 2. Revoke public execution of sensitive functions
REVOKE EXECUTE ON FUNCTION public.run_system_maintenance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_hmac_signatures() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prune_old_telemetry() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_hmac_nonces() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hmac_verify_signature_v2(uuid, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_agent_heartbeat_atomic(uuid, jsonb) FROM PUBLIC;

-- Grant to service_role specifically for automated tasks
GRANT EXECUTE ON FUNCTION public.run_system_maintenance() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_hmac_signatures() TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_old_telemetry() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_hmac_nonces() TO service_role;

-- 3. Fix ai_analysis_cache RLS
DROP POLICY IF EXISTS "Tenants can view their own AI cache" ON public.ai_analysis_cache;
CREATE POLICY "Tenants can view their own AI cache" 
ON public.ai_analysis_cache 
FOR SELECT 
USING (tenant_id = get_active_tenant_id());

-- 4. Set search_path for functions missing it
ALTER FUNCTION public.cleanup_expired_hmac_signatures() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.sync_agent_health_state() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.cleanup_expired_ai_cache() SET search_path = public, pg_catalog, pg_temp;