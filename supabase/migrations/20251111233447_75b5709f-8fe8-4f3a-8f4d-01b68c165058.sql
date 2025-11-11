-- FASE 3: Correções de Banco de Dados e Consistência

-- 1. Adicionar agent_id à enrollment_keys se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'enrollment_keys' 
    AND column_name = 'agent_id'
  ) THEN
    ALTER TABLE public.enrollment_keys ADD COLUMN agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Criar índices de performance
CREATE INDEX IF NOT EXISTS idx_agents_tenant_heartbeat ON public.agents(tenant_id, last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_agents_status ON public.agents(status);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_agent_active ON public.agent_tokens(agent_id, is_active);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_expires ON public.agent_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_enrollment_keys_key_active ON public.enrollment_keys(key, is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_enrollment_keys_agent ON public.enrollment_keys(agent_id);
CREATE INDEX IF NOT EXISTS idx_jobs_agent_status ON public.jobs(agent_name, status);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_collected ON public.agent_system_metrics(agent_id, collected_at DESC);

-- 3. Função de limpeza de agentes órfãos
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_agents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Remover agentes órfãos: status='pending', sem heartbeat, criados há mais de 48h
  WITH deleted AS (
    DELETE FROM public.agents
    WHERE status = 'pending'
      AND last_heartbeat IS NULL
      AND enrolled_at < NOW() - INTERVAL '48 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RAISE NOTICE 'Limpeza de agentes órfãos: % agentes removidos', deleted_count;
  RETURN deleted_count;
END;
$$;

-- 4. Trigger para atualizar uso de enrollment keys automaticamente
CREATE OR REPLACE FUNCTION public.update_enrollment_key_on_agent_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atualizar enrollment_keys quando um agente é criado
  UPDATE public.enrollment_keys
  SET 
    current_uses = current_uses + 1,
    used_by_agent = NEW.agent_name,
    used_at = NOW()
  WHERE agent_id = NEW.id
    AND used_by_agent IS NULL;
  
  RETURN NEW;
END;
$$;

-- Criar trigger se não existir
DROP TRIGGER IF EXISTS trigger_update_enrollment_key_usage ON public.agents;
CREATE TRIGGER trigger_update_enrollment_key_usage
  AFTER INSERT ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_enrollment_key_on_agent_insert();

COMMENT ON FUNCTION public.cleanup_orphaned_agents() IS 'Remove agents in pending state with no heartbeat for more than 48 hours';
COMMENT ON FUNCTION public.update_enrollment_key_on_agent_insert() IS 'Automatically updates enrollment key usage when an agent is inserted';