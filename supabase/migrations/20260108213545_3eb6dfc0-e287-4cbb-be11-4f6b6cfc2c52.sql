-- =============================================================================
-- FASE 4A: Politicas finais para fechar gaps de isolamento multi-tenant
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. agents_groups - Link entre agentes e grupos (herda tenant via group_id)
-- -----------------------------------------------------------------------------

-- SELECT: Usuarios podem ver links de grupos do tenant ativo
CREATE POLICY agents_groups_select_active_tenant 
ON agents_groups FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM agent_groups g
    WHERE g.id = agents_groups.group_id
    AND (g.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- INSERT: Usuarios podem criar links para grupos do tenant ativo
CREATE POLICY agents_groups_insert_active_tenant 
ON agents_groups FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM agent_groups g
    WHERE g.id = agents_groups.group_id
    AND (g.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- UPDATE: Usuarios podem atualizar links de grupos do tenant ativo
CREATE POLICY agents_groups_update_active_tenant 
ON agents_groups FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM agent_groups g
    WHERE g.id = agents_groups.group_id
    AND (g.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM agent_groups g
    WHERE g.id = agents_groups.group_id
    AND (g.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- DELETE: Usuarios podem remover links de grupos do tenant ativo
CREATE POLICY agents_groups_delete_active_tenant 
ON agents_groups FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM agent_groups g
    WHERE g.id = agents_groups.group_id
    AND (g.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- -----------------------------------------------------------------------------
-- 2. chaos_test_results - Tabela interna de testes (super admin only)
-- -----------------------------------------------------------------------------

-- SELECT: Apenas super admin
CREATE POLICY chaos_test_results_select_super_admin 
ON chaos_test_results FOR SELECT
USING (is_current_super_admin());

-- INSERT: Apenas super admin
CREATE POLICY chaos_test_results_insert_super_admin 
ON chaos_test_results FOR INSERT
WITH CHECK (is_current_super_admin());

-- DELETE: Apenas super admin
CREATE POLICY chaos_test_results_delete_super_admin 
ON chaos_test_results FOR DELETE
USING (is_current_super_admin());