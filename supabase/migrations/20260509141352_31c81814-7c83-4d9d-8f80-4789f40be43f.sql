-- 1. Remove duplicatas existentes usando CTE e row_number (compatível com UUID)
WITH duplicates AS (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY agent_id, domain, visited_at ORDER BY created_at DESC) as row_num
    FROM public.agent_web_activity
)
DELETE FROM public.agent_web_activity 
WHERE id IN (SELECT id FROM duplicates WHERE row_num > 1);

-- 2. Adiciona constraint de unicidade
ALTER TABLE public.agent_web_activity 
ADD CONSTRAINT agent_web_activity_uniqueness UNIQUE (agent_id, domain, visited_at);

-- 3. Otimiza a tabela de assinaturas HMAC
CREATE INDEX IF NOT EXISTS idx_agent_hmac_signatures_created_at ON public.agent_hmac_signatures(created_at);

-- 4. Função para limpeza automática
CREATE OR REPLACE FUNCTION public.cleanup_expired_hmac_signatures()
RETURNS void AS $$
BEGIN
    DELETE FROM public.agent_hmac_signatures
    WHERE created_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
