-- Migration: Permitir super_admins gerenciar agentes
-- Descrição: Adiciona políticas RLS para que super admins possam deletar e atualizar agentes em qualquer tenant

-- 1. Política DELETE para super_admins na tabela agents
CREATE POLICY "Super admins can delete agents"
ON public.agents
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- 2. Política UPDATE para super_admins na tabela agents
CREATE POLICY "Super admins can update agents"
ON public.agents
FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- 3. Política DELETE para super_admins na tabela agent_tokens
CREATE POLICY "Super admins can delete agent tokens"
ON public.agent_tokens
FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- 4. Política UPDATE para super_admins na tabela agent_tokens
CREATE POLICY "Super admins can update agent tokens"
ON public.agent_tokens
FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Comentários explicativos
COMMENT ON POLICY "Super admins can delete agents" ON public.agents IS 
  'Permite que super admins deletem agentes de qualquer tenant para troubleshooting';

COMMENT ON POLICY "Super admins can update agents" ON public.agents IS 
  'Permite que super admins atualizem agentes de qualquer tenant para troubleshooting';