-- =============================================================================
-- Migration: Audit-Ready Final Adjustments
-- 1. Add NULL guard to agents_groups policies
-- 2. REVOKE UPDATE on chaos_test_results
-- =============================================================================

-- ============================================
-- PART 1: agents_groups - Add NULL Guard
-- ============================================

-- SELECT policy with NULL guard
DROP POLICY IF EXISTS "agents_groups_select_active_tenant" ON agents_groups;
CREATE POLICY "agents_groups_select_active_tenant" ON agents_groups FOR SELECT
USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agent_groups g
    WHERE g.id = agents_groups.group_id
    AND (g.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- INSERT policy with NULL guard
DROP POLICY IF EXISTS "agents_groups_insert_active_tenant" ON agents_groups;
CREATE POLICY "agents_groups_insert_active_tenant" ON agents_groups FOR INSERT
WITH CHECK (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agent_groups g
    WHERE g.id = agents_groups.group_id
    AND (g.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- UPDATE policy with NULL guard (USING + WITH CHECK)
DROP POLICY IF EXISTS "agents_groups_update_active_tenant" ON agents_groups;
CREATE POLICY "agents_groups_update_active_tenant" ON agents_groups FOR UPDATE
USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agent_groups g
    WHERE g.id = agents_groups.group_id
    AND (g.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
)
WITH CHECK (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agent_groups g
    WHERE g.id = agents_groups.group_id
    AND (g.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- DELETE policy with NULL guard
DROP POLICY IF EXISTS "agents_groups_delete_active_tenant" ON agents_groups;
CREATE POLICY "agents_groups_delete_active_tenant" ON agents_groups FOR DELETE
USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agent_groups g
    WHERE g.id = agents_groups.group_id
    AND (g.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- ============================================
-- PART 2: chaos_test_results - REVOKE UPDATE
-- ============================================

-- Revoke UPDATE explicitly to formalize immutability
REVOKE UPDATE ON chaos_test_results FROM authenticated;

-- Add documentation comment
COMMENT ON TABLE chaos_test_results IS 
  'Tabela de resultados de testes de caos. IMUTAVEL - apenas super admin pode SELECT/INSERT/DELETE. UPDATE revogado explicitamente para auditoria SOC2/ISO27001.';