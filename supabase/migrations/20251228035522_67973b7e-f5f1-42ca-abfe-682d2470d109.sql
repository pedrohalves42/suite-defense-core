-- P0: Corrigir RLS policy permissiva em approval_requests
-- PROBLEMA: Policy "System can update approval requests" com qual: true permite qualquer usuario autenticado fazer UPDATE

-- 1. Remover policy permissiva existente
DROP POLICY IF EXISTS "System can update approval requests" ON public.approval_requests;

-- 2. Criar nova policy restritiva - apenas service_role pode fazer UPDATE
-- (Edge Functions usam service_role, entao isso e seguro)
CREATE POLICY "Only service role can update approval requests"
ON public.approval_requests
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Policy para admins poderem visualizar approval requests do seu tenant
-- (SELECT ja existe, mas garantir que esta correto)
DROP POLICY IF EXISTS "Admins can view tenant approval requests" ON public.approval_requests;
CREATE POLICY "Admins can view tenant approval requests"
ON public.approval_requests
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'super_admin')
  )
);

-- 4. Comentario de auditoria para documentar a mudanca
COMMENT ON POLICY "Only service role can update approval requests" ON public.approval_requests 
IS 'P0 Red Team Fix: Restringe UPDATE apenas para service_role. Impede bypass de aprovacao via REST API direta.';

-- 5. Adicionar rate limit table entry para approval_requests (suporte ao rate limit no codigo)
INSERT INTO public.rate_limits (identifier, endpoint, request_count, window_start, last_request_at)
VALUES ('global', 'approval_requests', 0, now(), now())
ON CONFLICT (identifier, endpoint) DO NOTHING;