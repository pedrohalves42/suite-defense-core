-- Adicionar campos de controle de update forcado na tabela agents
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS force_update_version TEXT,
ADD COLUMN IF NOT EXISTS force_update_reason TEXT,
ADD COLUMN IF NOT EXISTS force_update_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_forced_update_applied TIMESTAMPTZ;

-- Comentarios para documentacao
COMMENT ON COLUMN public.agents.force_update_version IS 'Versao para forcar update (bypassa job system)';
COMMENT ON COLUMN public.agents.force_update_reason IS 'Razao do force update (ex: hotfix_validateSet_break)';
COMMENT ON COLUMN public.agents.force_update_at IS 'Timestamp quando force update foi definido';
COMMENT ON COLUMN public.agents.last_forced_update_applied IS 'Timestamp quando o agente aplicou o force update';

-- Indice para encontrar agentes com force_update pendente
CREATE INDEX IF NOT EXISTS idx_agents_force_update_pending 
ON public.agents (force_update_version) 
WHERE force_update_version IS NOT NULL;