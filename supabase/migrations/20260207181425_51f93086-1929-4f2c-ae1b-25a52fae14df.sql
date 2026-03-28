
-- ============================================================================
-- CORRECAO GAP #1: profiles_public com isolamento de tenant
-- ADR-FINAL-001 Compliance: Security Invoker + Tenant Isolation
-- ============================================================================

-- Recriar view com isolamento adequado via user_roles
DROP VIEW IF EXISTS profiles_public CASCADE;

CREATE VIEW profiles_public 
WITH (security_invoker = on) AS
SELECT 
  p.id,
  p.user_id,
  p.username,
  p.full_name,
  p.created_at,
  p.updated_at
FROM profiles p
WHERE EXISTS (
  SELECT 1 FROM user_roles ur 
  WHERE ur.user_id = p.user_id 
    AND (ur.tenant_id = get_active_tenant_id() OR is_current_super_admin())
);

-- Comentario para auditoria SOC2/ISO27001
COMMENT ON VIEW profiles_public IS 
'ADR-FINAL-001: View com security_invoker=on e isolamento via user_roles.tenant_id. 
Usuarios normais veem apenas perfis do seu tenant ativo. Super admins veem todos.
Corrigido em 2026-02-07 para fechar gap de seguranca critico.';

-- Garantir permissoes corretas
REVOKE ALL ON profiles_public FROM anon, public;
GRANT SELECT ON profiles_public TO authenticated, service_role;
