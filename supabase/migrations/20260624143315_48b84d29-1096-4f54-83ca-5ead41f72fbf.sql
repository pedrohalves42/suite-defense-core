-- B-FIX-01: restrict SELECT on ops_checks to super admin only.
-- Justificativa: ops_checks contém inventário operacional sensível
-- (target_url, last_result com stacktraces/payloads). Não é catálogo público.
-- Ver docs/audits/active/bloco-b-passo-d.md.

DROP POLICY IF EXISTS "ops_checks_view_all" ON public.ops_checks;

CREATE POLICY "ops_checks_select_super_admin"
  ON public.ops_checks
  FOR SELECT
  TO authenticated
  USING (public.is_current_super_admin());

-- Policy de escrita (ALL) permanece: ops_checks_super_admin_only.
-- service_role bypassa RLS por padrão (scheduler/edge functions seguem funcionando).