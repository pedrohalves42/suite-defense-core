-- Trigger de backup para auto-preencher agent_id quando NULL
CREATE OR REPLACE FUNCTION public.auto_populate_agent_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Se agent_id e NULL mas agent_name esta presente, buscar o agent_id
  IF NEW.agent_id IS NULL AND NEW.agent_name IS NOT NULL THEN
    SELECT id INTO NEW.agent_id
    FROM public.agents
    WHERE agent_name = NEW.agent_name
      AND tenant_id = NEW.tenant_id
    LIMIT 1;
    
    -- Log se nao encontrou agente (debug)
    IF NEW.agent_id IS NULL THEN
      RAISE NOTICE 'auto_populate_agent_id: Agent not found for name=%, tenant=%', NEW.agent_name, NEW.tenant_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger antes do INSERT na tabela jobs
DROP TRIGGER IF EXISTS tr_auto_populate_agent_id ON public.jobs;

CREATE TRIGGER tr_auto_populate_agent_id
BEFORE INSERT ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_populate_agent_id();

-- Comentario explicativo
COMMENT ON FUNCTION public.auto_populate_agent_id() IS 'Auto-popula agent_id baseado em agent_name quando NULL durante INSERT em jobs';