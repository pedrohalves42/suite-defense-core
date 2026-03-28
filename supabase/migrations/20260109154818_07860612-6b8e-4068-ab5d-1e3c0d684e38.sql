-- ADR-027: Final Policy Corrections
-- Elimina politicas legadas e normaliza agent_tokens

-- =============================================================================
-- FASE P0: Remocao de Politicas Permissivas Duplicadas
-- =============================================================================

-- 1. score_governance_log - remover policy duplicada com public + true
DROP POLICY IF EXISTS "Service role can insert governance logs" ON score_governance_log;

-- 2. job_executions - remover policy duplicada com public + true
DROP POLICY IF EXISTS "Service role can insert executions" ON job_executions;

-- 3. soc2_criteria - remover policy legada com user_has_tenant_access
DROP POLICY IF EXISTS soc2_criteria_insert_admin ON soc2_criteria;

-- 4. soc2_controls - remover policy legada com user_has_tenant_access
DROP POLICY IF EXISTS soc2_controls_insert_admin ON soc2_controls;

-- 5. compliance_policies - remover policy legada com user_has_tenant_access
DROP POLICY IF EXISTS compliance_policies_insert_admin ON compliance_policies;

-- 6. vendor_risk_registry - remover policy legada com user_has_tenant_access
DROP POLICY IF EXISTS vendor_risk_insert_admin ON vendor_risk_registry;

-- =============================================================================
-- FASE P1: Normalizacao agent_tokens (consistencia arquitetural)
-- =============================================================================

-- SELECT - normalizar estrutura para padrao ADR-026
DROP POLICY IF EXISTS agent_tokens_select_active_tenant ON agent_tokens;
CREATE POLICY agent_tokens_select_active_tenant ON agent_tokens
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM agents a
    WHERE a.id = agent_tokens.agent_id
    AND a.tenant_id = get_active_tenant_id()
  ))
  OR is_current_super_admin()
);

-- INSERT - normalizar estrutura para padrao ADR-026
DROP POLICY IF EXISTS agent_tokens_insert_active_tenant ON agent_tokens;
CREATE POLICY agent_tokens_insert_active_tenant ON agent_tokens
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM agents a
    WHERE a.id = agent_tokens.agent_id
    AND a.tenant_id = get_active_tenant_id()
  ))
  OR is_current_super_admin()
);

-- UPDATE - normalizar estrutura para padrao ADR-026
DROP POLICY IF EXISTS agent_tokens_update_active_tenant ON agent_tokens;
CREATE POLICY agent_tokens_update_active_tenant ON agent_tokens
FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM agents a
    WHERE a.id = agent_tokens.agent_id
    AND a.tenant_id = get_active_tenant_id()
  ))
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM agents a
    WHERE a.id = agent_tokens.agent_id
    AND a.tenant_id = get_active_tenant_id()
  ))
  OR is_current_super_admin()
);

-- DELETE - normalizar estrutura para padrao ADR-026
DROP POLICY IF EXISTS agent_tokens_delete_active_tenant ON agent_tokens;
CREATE POLICY agent_tokens_delete_active_tenant ON agent_tokens
FOR DELETE USING (
  (get_active_tenant_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM agents a
    WHERE a.id = agent_tokens.agent_id
    AND a.tenant_id = get_active_tenant_id()
  ))
  OR is_current_super_admin()
);