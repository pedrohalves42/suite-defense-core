-- =============================================================================
-- CORREÇÃO CRÍTICA: auto_set_tenant_id para operações de service_role
-- =============================================================================
-- Problema: Edge Functions com service_role não têm JWT com active_tenant_id,
-- causando falha em todos os triggers que inserem em tabelas com este trigger.
-- Solução: Aceitar tenant_id explícito e não falhar para service_role.
-- =============================================================================

-- Modificar função para ser mais permissiva com operações de sistema
CREATE OR REPLACE FUNCTION public.auto_set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Se tenant_id já foi fornecido explicitamente, usar sem modificação
  IF NEW.tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Tentar buscar do JWT
  NEW.tenant_id := public.get_active_tenant_id();
  
  -- Se obteve do JWT, retornar
  IF NEW.tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Se ainda NULL, verificar contexto
  -- Para operações de sistema (triggers cascateados, service_role), 
  -- permitir NULL apenas para tabelas não-críticas
  IF current_setting('role', true) IN ('service_role', 'postgres', 'supabase_admin') 
     OR current_user IN ('postgres', 'supabase_admin') THEN
    -- Logar com sampling para evitar flood (1% das vezes)
    IF random() < 0.01 THEN
      RAISE LOG '[auto_set_tenant_id] No tenant_id for system operation on % by %', 
        TG_TABLE_NAME, current_user;
    END IF;
    
    -- Tabelas críticas DEVEM ter tenant_id explícito
    IF TG_TABLE_NAME IN ('security_logs', 'audit_logs') THEN
      RAISE EXCEPTION 'tenant_id must be provided explicitly for % (system operation)', TG_TABLE_NAME
        USING ERRCODE = '23502';
    END IF;
    
    -- Para outras tabelas, permitir NULL em operações de sistema
    -- (a aplicação deve garantir que tenant_id é passado quando necessário)
    RETURN NEW;
  END IF;
  
  -- Para usuários normais, tenant_id é obrigatório
  RAISE EXCEPTION 'tenant_id cannot be NULL and no active tenant found in JWT for table %', TG_TABLE_NAME
    USING ERRCODE = '23502';
END;
$function$;

-- =============================================================================
-- CORREÇÃO: check_job_quota - Garantir tenant_id explícito em security_logs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_job_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_max_queued INTEGER;
  v_current_queued INTEGER;
BEGIN
  -- Buscar limite customizado ou usar padrão
  SELECT COALESCE(tjq.max_queued_jobs, 100)
  INTO v_max_queued
  FROM tenant_job_quotas tjq
  WHERE tjq.tenant_id = NEW.tenant_id;
  
  IF v_max_queued IS NULL THEN
    v_max_queued := 100;
  END IF;
  
  -- Contar jobs queued/delivered atuais
  SELECT COUNT(*)
  INTO v_current_queued
  FROM jobs
  WHERE tenant_id = NEW.tenant_id
    AND status IN ('queued', 'delivered');
  
  -- Verificar quota
  IF v_current_queued >= v_max_queued THEN
    -- CORREÇÃO: Inserir com tenant_id EXPLÍCITO (usando o tenant_id do job)
    INSERT INTO security_logs (
      tenant_id,
      ip_address,
      endpoint,
      attack_type,
      severity,
      blocked,
      details
    ) VALUES (
      NEW.tenant_id,  -- IMPORTANTE: tenant_id explícito do job
      'system',
      'job_insert',
      'quota_exceeded',
      'high',
      true,
      jsonb_build_object(
        'current_queued', v_current_queued,
        'max_allowed', v_max_queued,
        'job_type', NEW.type,
        'agent_name', NEW.agent_name
      )
    );
    
    RAISE EXCEPTION 'JOB_QUOTA_EXCEEDED: Tenant has % queued jobs (limit: %). Wait for jobs to complete or contact admin.',
      v_current_queued, v_max_queued
      USING ERRCODE = '54001';
  END IF;
  
  RETURN NEW;
END;
$function$;