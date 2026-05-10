-- Permite que usuários autenticados vejam os tenants onde possuem ao menos um papel.
-- Necessário para o bootstrap do tenant ativo após login (join user_roles -> tenants).
CREATE POLICY "Users can view tenants they belong to"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = tenants.id
  )
);