-- ============================================
-- P0 CORRECTIONS: Orphaned Jobs + Validation Trigger + Performance Indexes
-- ============================================

-- FASE 1: Limpar jobs orfaos identificados na auditoria
DELETE FROM public.jobs 
WHERE id IN (
  'dc452ecc-e06e-4e14-bb31-4c32eb6a3402',
  'b5d15c82-1cde-434d-b0ee-0ac2245328bb',
  '702160b5-3042-4fae-b114-16a7e7f3c0f3'
);

-- FASE 2: Criar funcao de validacao de agent_name antes de INSERT em jobs
CREATE OR REPLACE FUNCTION public.validate_job_agent_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id UUID;
BEGIN
  -- Verificar se o agent_name existe no mesmo tenant
  SELECT id INTO v_agent_id
  FROM public.agents
  WHERE agent_name = NEW.agent_name
    AND tenant_id = NEW.tenant_id
  LIMIT 1;
  
  -- Se nao encontrou, bloquear INSERT
  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Invalid agent_name: "%" does not exist in tenant %', 
      NEW.agent_name, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  
  -- Auto-preencher agent_id se estiver NULL
  IF NEW.agent_id IS NULL THEN
    NEW.agent_id := v_agent_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Criar trigger que dispara BEFORE INSERT
DROP TRIGGER IF EXISTS tr_validate_job_agent_name ON public.jobs;
CREATE TRIGGER tr_validate_job_agent_name
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_job_agent_name();

-- FASE 3: Criar indices para performance de queries RLS
CREATE INDEX IF NOT EXISTS idx_agents_tenant_name 
  ON public.agents(tenant_id, agent_name);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_tenant_role 
  ON public.user_roles(user_id, tenant_id, role);