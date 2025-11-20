-- FASE 4: Corrigir RLS Policy problematica em enrollment_keys
-- Remover policy inutil que contem "AND false"

DROP POLICY IF EXISTS "Operators can view enrollment key metadata" ON public.enrollment_keys;

-- Criar policy correta para operators (se necessario)
-- Apenas se operators realmente precisarem acessar enrollment keys
CREATE POLICY "Operators can view enrollment key metadata"
ON public.enrollment_keys
FOR SELECT
TO public
USING (
  has_role(auth.uid(), 'operator'::app_role) 
  AND tenant_id = current_user_tenant_id()
);