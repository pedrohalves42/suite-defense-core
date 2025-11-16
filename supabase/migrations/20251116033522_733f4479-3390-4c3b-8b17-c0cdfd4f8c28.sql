-- ============================================================================
-- FASE 2: RLS Policy para Super Admins gerenciarem Jobs
-- ============================================================================
-- Objetivo: Permitir super admins criarem/lerem/atualizarem jobs de teste
-- em qualquer tenant para debugging e suporte, sem depender da role admin.
-- ============================================================================

CREATE POLICY "Super admins can manage all jobs"
ON jobs
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
);

COMMENT ON POLICY "Super admins can manage all jobs" ON jobs IS
'Super admins têm acesso global à tabela jobs para debug, suporte e testes de integração. Esta policy permite que super admins criem jobs de teste sem violar RLS.';