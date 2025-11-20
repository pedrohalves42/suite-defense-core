-- Migration: Invalidar tokens antigos quando novo agente com mesmo nome e criado
-- Previne conflitos de multiplos instaladores para o mesmo agent_name

CREATE OR REPLACE FUNCTION public.invalidate_old_agent_tokens()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_agent_id UUID;
BEGIN
  -- Verificar se ja existe agente com mesmo nome no tenant
  SELECT id INTO v_existing_agent_id
  FROM public.agents
  WHERE agent_name = NEW.agent_name
    AND tenant_id = NEW.tenant_id
    AND id != NEW.id
    AND status IN ('pending', 'active')
  LIMIT 1;
  
  IF v_existing_agent_id IS NOT NULL THEN
    -- Invalidar todos os tokens do agente antigo
    UPDATE public.agent_tokens
    SET is_active = false
    WHERE agent_id = v_existing_agent_id;
    
    -- Marcar agente antigo como inactive
    UPDATE public.agents
    SET status = 'inactive'
    WHERE id = v_existing_agent_id;
    
    RAISE NOTICE 'Invalidated old agent % and its tokens', v_existing_agent_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger para executar a funcao apos insercao de novo agente
DROP TRIGGER IF EXISTS trg_invalidate_old_agent_tokens ON public.agents;

CREATE TRIGGER trg_invalidate_old_agent_tokens
  AFTER INSERT ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_old_agent_tokens();

COMMENT ON FUNCTION public.invalidate_old_agent_tokens() IS 
  'Invalida tokens e marca como inactive agentes anteriores com mesmo nome no tenant (previne conflitos de instalacao)';