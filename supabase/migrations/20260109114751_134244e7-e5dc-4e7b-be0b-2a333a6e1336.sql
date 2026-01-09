
-- =====================================================
-- ADR-026 MIGRATION BATCH 2: Governance Tables
-- 15 policies across approval/playbook/governance tables
-- =====================================================

-- 1. approval_chains (has tenant_id) - ALL
DROP POLICY IF EXISTS "Admins can manage approval chains" ON approval_chains;
DROP POLICY IF EXISTS "approval_chains_all_active_tenant" ON approval_chains;
CREATE POLICY "approval_chains_all_active_tenant" ON approval_chains
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 2. approval_requests (has tenant_id) - INSERT
DROP POLICY IF EXISTS "Admins can create approval requests" ON approval_requests;
DROP POLICY IF EXISTS "approval_requests_insert_active_tenant" ON approval_requests;
CREATE POLICY "approval_requests_insert_active_tenant" ON approval_requests
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 3. approval_requests (has tenant_id) - SELECT
DROP POLICY IF EXISTS "Admins can view tenant approval requests" ON approval_requests;
DROP POLICY IF EXISTS "approval_requests_select_active_tenant" ON approval_requests;
CREATE POLICY "approval_requests_select_active_tenant" ON approval_requests
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 4. approvals (NO tenant_id - via approval_requests) - INSERT
DROP POLICY IF EXISTS "Admins can create approvals" ON approvals;
DROP POLICY IF EXISTS "approvals_insert_active_tenant" ON approvals;
CREATE POLICY "approvals_insert_active_tenant" ON approvals
FOR INSERT WITH CHECK (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM approval_requests ar
    WHERE ar.id = approvals.request_id
    AND (ar.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- 5. governance_adrs (has tenant_id) - ALL
DROP POLICY IF EXISTS "Admins can manage ADRs for their tenant" ON governance_adrs;
DROP POLICY IF EXISTS "governance_adrs_all_active_tenant" ON governance_adrs;
CREATE POLICY "governance_adrs_all_active_tenant" ON governance_adrs
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 6. governance_adrs (has tenant_id) - SELECT
DROP POLICY IF EXISTS "Users can view ADRs for their tenant" ON governance_adrs;
DROP POLICY IF EXISTS "governance_adrs_select_active_tenant" ON governance_adrs;
CREATE POLICY "governance_adrs_select_active_tenant" ON governance_adrs
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 7. governance_reports (has tenant_id) - INSERT
DROP POLICY IF EXISTS "Users can insert tenant reports" ON governance_reports;
DROP POLICY IF EXISTS "governance_reports_insert_active_tenant" ON governance_reports;
CREATE POLICY "governance_reports_insert_active_tenant" ON governance_reports
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 8. governance_reports (has tenant_id) - SELECT
DROP POLICY IF EXISTS "Users can read tenant reports" ON governance_reports;
DROP POLICY IF EXISTS "governance_reports_select_active_tenant" ON governance_reports;
CREATE POLICY "governance_reports_select_active_tenant" ON governance_reports
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 9. governance_reports (has tenant_id) - UPDATE
DROP POLICY IF EXISTS "Users can update tenant reports" ON governance_reports;
DROP POLICY IF EXISTS "governance_reports_update_active_tenant" ON governance_reports;
CREATE POLICY "governance_reports_update_active_tenant" ON governance_reports
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 10. playbook_actions (NO tenant_id - via playbooks) - ALL
DROP POLICY IF EXISTS "Admins can manage playbook actions" ON playbook_actions;
DROP POLICY IF EXISTS "playbook_actions_all_active_tenant" ON playbook_actions;
CREATE POLICY "playbook_actions_all_active_tenant" ON playbook_actions
FOR ALL USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM playbooks p
    WHERE p.id = playbook_actions.playbook_id
    AND (p.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- 11. playbook_actions (NO tenant_id - via playbooks) - SELECT
DROP POLICY IF EXISTS "Users can view playbook actions" ON playbook_actions;
DROP POLICY IF EXISTS "playbook_actions_select_active_tenant" ON playbook_actions;
CREATE POLICY "playbook_actions_select_active_tenant" ON playbook_actions
FOR SELECT USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM playbooks p
    WHERE p.id = playbook_actions.playbook_id
    AND (p.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- 12. playbook_executions (has tenant_id) - ALL
DROP POLICY IF EXISTS "Admins can manage executions in their tenant" ON playbook_executions;
DROP POLICY IF EXISTS "playbook_executions_all_active_tenant" ON playbook_executions;
CREATE POLICY "playbook_executions_all_active_tenant" ON playbook_executions
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 13. playbook_executions (has tenant_id) - SELECT
DROP POLICY IF EXISTS "Users can view executions in their tenant" ON playbook_executions;
DROP POLICY IF EXISTS "playbook_executions_select_active_tenant" ON playbook_executions;
CREATE POLICY "playbook_executions_select_active_tenant" ON playbook_executions
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 14. playbooks (has tenant_id) - ALL
DROP POLICY IF EXISTS "Admins can manage playbooks in their tenant" ON playbooks;
DROP POLICY IF EXISTS "playbooks_all_active_tenant" ON playbooks;
CREATE POLICY "playbooks_all_active_tenant" ON playbooks
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 15. playbooks (has tenant_id) - SELECT
DROP POLICY IF EXISTS "Users can view playbooks in their tenant" ON playbooks;
DROP POLICY IF EXISTS "playbooks_select_active_tenant" ON playbooks;
CREATE POLICY "playbooks_select_active_tenant" ON playbooks
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);
