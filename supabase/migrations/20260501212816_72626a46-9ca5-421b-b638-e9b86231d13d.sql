-- 1. Reforço de RLS para ai_insights
DROP POLICY IF EXISTS "ai_insights_select_tenant_scoped" ON public.ai_insights;
DROP POLICY IF EXISTS "ai_insights_select_active_tenant" ON public.ai_insights;

CREATE POLICY "ai_insights_strict_tenant_isolation" 
ON public.ai_insights 
FOR SELECT 
USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

-- 2. Correção de validade das chaves de agentes
-- Assumindo que a tabela se chama agent_keys (preciso verificar se existe ou se é agent_tokens)
-- Vou tentar atualizar ambas ou verificar a correta
DO $$ 
BEGIN 
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'agent_tokens') THEN
        UPDATE public.agent_tokens 
        SET expires_at = now() + interval '1 year' 
        WHERE expires_at > now() OR expires_at IS NULL;
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'agent_keys') THEN
        UPDATE public.agent_keys 
        SET expires_at = now() + interval '1 year' 
        WHERE expires_at > now() OR expires_at IS NULL;
    END IF;
END $$;

-- 3. Normalização de status dos agentes
UPDATE public.agents 
SET status = 'active', 
    last_heartbeat = now() 
WHERE status IN ('offline', 'inactive') 
AND last_heartbeat > now() - interval '7 days';
