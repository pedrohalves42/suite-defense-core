-- Garantir que o RLS está ativado
ALTER TABLE public.agent_hmac_signatures ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes para evitar conflitos (caso existam)
DROP POLICY IF EXISTS "Enable service_role full access" ON public.agent_hmac_signatures;
DROP POLICY IF EXISTS "Enable insert for agents" ON public.agent_hmac_signatures;
DROP POLICY IF EXISTS "Enable select for service_role" ON public.agent_hmac_signatures;

-- Política 1: Acesso total para service_role (Edge Functions e scripts administrativos)
CREATE POLICY "Enable service_role full access" ON public.agent_hmac_signatures
AS PERMISSIVE FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Política 2: Permitir inserção para agentes (anon/authenticated) para registro de assinaturas HMAC
-- Nota: A validação real do HMAC ocorre na camada de aplicação (Edge Functions), 
-- mas a tabela precisa permitir o registro do log de assinaturas para evitar ataques de replay.
CREATE POLICY "Enable insert for signatures" ON public.agent_hmac_signatures
AS PERMISSIVE FOR INSERT
TO public
WITH CHECK (true);

-- Política 3: Permitir leitura apenas para fins de verificação de duplicatas (usado na validação)
CREATE POLICY "Enable select for verification" ON public.agent_hmac_signatures
AS PERMISSIVE FOR SELECT
TO public
USING (true);
