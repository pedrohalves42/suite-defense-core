-- ============================================
-- PLAYBOOKS ENTERPRISE UPGRADE
-- Versionamento + Snapshots Imutaveis + Anti-Loop
-- ============================================

-- 1?? Adicionar versionamento ao playbooks
ALTER TABLE public.playbooks 
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- 2?? Adicionar cooldown_minutes se nao existir
ALTER TABLE public.playbooks 
  ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 60;

-- 3?? Adicionar snapshots imutaveis ao playbook_executions
ALTER TABLE public.playbook_executions 
  ADD COLUMN IF NOT EXISTS playbook_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS actions_snapshot JSONB;

-- 4?? Adicionar ignored_reason para execucoes ignoradas
ALTER TABLE public.playbook_executions 
  ADD COLUMN IF NOT EXISTS ignored_reason TEXT;

-- 5?? FUNCAO ANTI-LOOP ROBUSTA
CREATE OR REPLACE FUNCTION public.has_recent_playbook_execution(
  p_playbook_id UUID,
  p_tenant_id UUID,
  p_agent_id UUID DEFAULT NULL,
  p_cooldown_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  exists_execution BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.playbook_executions e
    WHERE e.playbook_id = p_playbook_id
      AND e.tenant_id = p_tenant_id
      AND (p_agent_id IS NULL OR e.agent_id = p_agent_id)
      AND e.status NOT IN ('cancelled', 'ignored')
      AND e.triggered_at >= now() - make_interval(mins => p_cooldown_minutes)
  )
  INTO exists_execution;

  RETURN exists_execution;
END;
$$;

-- 6?? TRIGGER DE IMUTABILIDADE
CREATE OR REPLACE FUNCTION public.prevent_playbook_execution_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- Impedir alteracao apos conclusao/cancelamento/falha
  IF OLD.status IN ('completed', 'cancelled', 'failed', 'ignored') THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Playbook execution is immutable after completion. Status: %', OLD.status
      USING ERRCODE = '23514';
  END IF;
  
  -- Impedir alteracao de snapshots apos criacao
  IF OLD.playbook_snapshot IS NOT NULL AND NEW.playbook_snapshot IS DISTINCT FROM OLD.playbook_snapshot THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: playbook_snapshot cannot be modified after creation'
      USING ERRCODE = '23514';
  END IF;
  
  IF OLD.actions_snapshot IS NOT NULL AND NEW.actions_snapshot IS DISTINCT FROM OLD.actions_snapshot THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: actions_snapshot cannot be modified after creation'
      USING ERRCODE = '23514';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dropar trigger se existir antes de recriar
DROP TRIGGER IF EXISTS trg_prevent_playbook_execution_modification ON public.playbook_executions;

CREATE TRIGGER trg_prevent_playbook_execution_modification
BEFORE UPDATE ON public.playbook_executions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_playbook_execution_modification();

-- 7?? TRIGGER PARA INCREMENTAR VERSAO DO PLAYBOOK
CREATE OR REPLACE FUNCTION public.increment_playbook_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Incrementar versao quando playbook e modificado (exceto updated_at)
  IF (NEW.name IS DISTINCT FROM OLD.name) OR
     (NEW.description IS DISTINCT FROM OLD.description) OR
     (NEW.trigger_type IS DISTINCT FROM OLD.trigger_type) OR
     (NEW.trigger_conditions IS DISTINCT FROM OLD.trigger_conditions) OR
     (NEW.severity IS DISTINCT FROM OLD.severity) OR
     (NEW.require_approval IS DISTINCT FROM OLD.require_approval) THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_playbook_version ON public.playbooks;

CREATE TRIGGER trg_increment_playbook_version
BEFORE UPDATE ON public.playbooks
FOR EACH ROW
EXECUTE FUNCTION public.increment_playbook_version();

-- 8?? INDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_playbook_executions_cooldown 
  ON public.playbook_executions(playbook_id, tenant_id, agent_id, triggered_at, status);

CREATE INDEX IF NOT EXISTS idx_playbooks_version 
  ON public.playbooks(id, version);

-- 9?? COMENTARIOS DE DOCUMENTACAO
COMMENT ON COLUMN public.playbooks.version IS 'Auto-incrementing version for audit trail';
COMMENT ON COLUMN public.playbooks.cooldown_minutes IS 'Minimum minutes between executions for same agent';
COMMENT ON COLUMN public.playbook_executions.playbook_snapshot IS 'Immutable copy of playbook config at trigger time';
COMMENT ON COLUMN public.playbook_executions.actions_snapshot IS 'Immutable copy of actions at trigger time';
COMMENT ON FUNCTION public.has_recent_playbook_execution IS 'Anti-loop: checks if playbook was recently executed for same agent';