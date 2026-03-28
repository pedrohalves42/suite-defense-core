
-- Correcao: Permitir service_role atualizar ai_actions
-- O auto-execute-ai-actions usa service_role e precisa atualizar status

-- Opcao 1: Adicionar policy para service role (mais seguro)
CREATE POLICY "service_role_can_update_actions"
ON public.ai_actions
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- Garantir que INSERT tambem funciona para service role
CREATE POLICY "service_role_can_insert_actions"
ON public.ai_actions
FOR INSERT
TO service_role
WITH CHECK (true);
