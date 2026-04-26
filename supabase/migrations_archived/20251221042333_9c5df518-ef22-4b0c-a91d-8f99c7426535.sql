-- ============================================================
-- SSA-003: AUTO CANCEL ZOMBIE JOBS (TTL de 2 horas)
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_cancel_zombie_jobs()
RETURNS TABLE(cancelled_count integer, job_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cancelled_count INTEGER;
  v_job_ids UUID[];
BEGIN
  -- Cancelar jobs "delivered" ha mais de 2 horas
  WITH cancelled_jobs AS (
    UPDATE jobs
    SET 
      status = 'failed',
      error_message = 'Auto-cancelled: Job stuck in delivered state for >2 hours (Zombie TTL)',
      completed_at = NOW()
    WHERE status = 'delivered'
      AND delivered_at < NOW() - INTERVAL '2 hours'
    RETURNING id, agent_name, tenant_id
  ),
  -- Log de cada job cancelado
  logged AS (
    INSERT INTO security_logs (
      tenant_id,
      ip_address,
      endpoint,
      attack_type,
      severity,
      blocked,
      details
    )
    SELECT 
      tenant_id,
      'system',
      'zombie_job_cleanup',
      'zombie_job_ttl',
      'medium',
      false,
      jsonb_build_object(
        'job_id', id,
        'agent_name', agent_name,
        'action', 'auto_cancelled',
        'ttl_hours', 2
      )
    FROM cancelled_jobs
    RETURNING 1
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(id)
  INTO v_cancelled_count, v_job_ids
  FROM cancelled_jobs;
  
  -- Log resumo
  IF v_cancelled_count > 0 THEN
    RAISE NOTICE '[SSA-003] Zombie Job TTL: % jobs cancelled', v_cancelled_count;
  END IF;
  
  RETURN QUERY SELECT 
    COALESCE(v_cancelled_count, 0),
    COALESCE(v_job_ids, ARRAY[]::UUID[]);
END;
$$;

-- Comentario para documentacao
COMMENT ON FUNCTION public.auto_cancel_zombie_jobs() IS 
'SSA-003: Auto-cancela jobs em estado "delivered" ha mais de 2 horas. 
Previne zombie jobs que bloqueiam o sistema.';


-- ============================================================
-- SSA-005: JOB QUOTA ENFORCEMENT (limite de 100 jobs por tenant)
-- ============================================================

-- Tabela para limites customizados por tenant (opcional)
CREATE TABLE IF NOT EXISTS public.tenant_job_quotas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  max_queued_jobs INTEGER NOT NULL DEFAULT 100,
  max_delivered_jobs INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- RLS para tenant_job_quotas
ALTER TABLE public.tenant_job_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view their tenant quotas"
  ON public.tenant_job_quotas FOR SELECT
  USING (tenant_id IN (
    SELECT ur.tenant_id FROM user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
  ));

-- Funcao de validacao de quota
CREATE OR REPLACE FUNCTION public.check_job_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max_queued INTEGER;
  v_current_queued INTEGER;
BEGIN
  -- Buscar limite customizado ou usar padrao
  SELECT COALESCE(tjq.max_queued_jobs, 100)
  INTO v_max_queued
  FROM tenant_job_quotas tjq
  WHERE tjq.tenant_id = NEW.tenant_id;
  
  -- Se nao ha config customizada, usar padrao
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
    -- Log de tentativa bloqueada
    INSERT INTO security_logs (
      tenant_id,
      ip_address,
      endpoint,
      attack_type,
      severity,
      blocked,
      details
    ) VALUES (
      NEW.tenant_id,
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
      USING ERRCODE = '54001'; -- insufficient_resources
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger para verificar quota antes de INSERT
DROP TRIGGER IF EXISTS enforce_job_quota ON public.jobs;
CREATE TRIGGER enforce_job_quota
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.check_job_quota();

COMMENT ON FUNCTION public.check_job_quota() IS 
'SSA-005: Limita quantidade de jobs queued/delivered por tenant para prevenir DoS. Default: 100 jobs.';


-- ============================================================
-- Indice para performance das queries de quota
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status_pending
  ON public.jobs (tenant_id, status)
  WHERE status IN ('queued', 'delivered');