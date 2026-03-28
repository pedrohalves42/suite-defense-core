-- =====================================================
-- FASE 1: Criar coluna agent_version_code
-- =====================================================

-- Adicionar coluna para comparacao numerica de versoes
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS agent_version_code INTEGER;

-- Criar funcao para converter versao string para codigo numerico
-- Formula: major * 10000 + minor * 100 + patch
-- Ex: v4.2.1 = 40201, v4.1.9 = 40109
CREATE OR REPLACE FUNCTION public.parse_version_code(version_text TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  clean_version TEXT;
  parts TEXT[];
  major INT;
  minor INT;
  patch INT;
BEGIN
  IF version_text IS NULL THEN RETURN NULL; END IF;
  
  -- Remove 'v' prefix se existir
  clean_version := REGEXP_REPLACE(version_text, '^v', '', 'i');
  
  -- Split por '.'
  parts := STRING_TO_ARRAY(clean_version, '.');
  
  -- Parse cada parte (com fallback para 0)
  major := COALESCE(NULLIF(parts[1], '')::INT, 0);
  minor := COALESCE(NULLIF(parts[2], '')::INT, 0);
  patch := COALESCE(NULLIF(parts[3], '')::INT, 0);
  
  RETURN (major * 10000) + (minor * 100) + patch;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Popular coluna com versoes existentes
UPDATE public.agents 
SET agent_version_code = public.parse_version_code(agent_version)
WHERE agent_version IS NOT NULL 
  AND agent_version_code IS NULL;

-- Criar indice para queries eficientes
CREATE INDEX IF NOT EXISTS idx_agents_version_code ON public.agents(agent_version_code);

-- =====================================================
-- FASE 2: Triggers para manter sincronizado
-- =====================================================

-- Trigger para atualizar automaticamente version_code quando agent_version muda (UPDATE)
CREATE OR REPLACE FUNCTION public.update_agent_version_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.agent_version IS DISTINCT FROM OLD.agent_version THEN
    NEW.agent_version_code := parse_version_code(NEW.agent_version);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_update_agent_version_code ON public.agents;
CREATE TRIGGER tr_update_agent_version_code
  BEFORE UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_agent_version_code();

-- Trigger para INSERT
CREATE OR REPLACE FUNCTION public.set_agent_version_code_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.agent_version IS NOT NULL AND NEW.agent_version_code IS NULL THEN
    NEW.agent_version_code := parse_version_code(NEW.agent_version);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_agent_version_code_insert ON public.agents;
CREATE TRIGGER tr_set_agent_version_code_insert
  BEFORE INSERT ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_agent_version_code_on_insert();