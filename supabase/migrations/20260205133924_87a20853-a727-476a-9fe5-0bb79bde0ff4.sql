
-- LGPD: Adicionar coluna de consentimento para monitoramento de atividade web
-- Isso permite que cada agente tenha controle explicito sobre a coleta de dados

-- 1. Adicionar coluna de consentimento
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS web_activity_consent_enabled boolean DEFAULT false;

-- 2. Adicionar coluna para timestamp do consentimento
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS web_activity_consent_at timestamptz DEFAULT NULL;

-- 3. Adicionar coluna para quem habilitou o consentimento
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS web_activity_consent_by uuid DEFAULT NULL;

-- 4. Comentarios para documentacao
COMMENT ON COLUMN public.agents.web_activity_consent_enabled IS 'LGPD: Indica se a coleta de atividade web esta habilitada para este agente';
COMMENT ON COLUMN public.agents.web_activity_consent_at IS 'LGPD: Timestamp de quando o consentimento foi dado/revogado';
COMMENT ON COLUMN public.agents.web_activity_consent_by IS 'LGPD: ID do usuario que habilitou/desabilitou o consentimento';

-- 5. Funcao para atualizar consent de forma segura
CREATE OR REPLACE FUNCTION public.update_agent_web_consent(
  p_agent_id uuid,
  p_enabled boolean,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agents
  SET 
    web_activity_consent_enabled = p_enabled,
    web_activity_consent_at = NOW(),
    web_activity_consent_by = p_user_id
  WHERE id = p_agent_id
    AND tenant_id = get_active_tenant_id();
END;
$$;

-- 6. Grant para usuarios autenticados
GRANT EXECUTE ON FUNCTION public.update_agent_web_consent(uuid, boolean, uuid) TO authenticated;
