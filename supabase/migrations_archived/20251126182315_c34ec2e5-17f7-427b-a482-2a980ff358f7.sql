-- Corrigir RLS policies das tabelas de seguranca para incluir super_admin

-- 1. Atualizar policy de agent_web_activity
DROP POLICY IF EXISTS "Users can view web activity in their tenant" ON agent_web_activity;
CREATE POLICY "Users can view web activity in their tenant" ON agent_web_activity
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'operator', 'viewer', 'super_admin')
    )
  );

-- 2. Atualizar policy de antivirus_status
DROP POLICY IF EXISTS "Users can view antivirus status in their tenant" ON antivirus_status;
CREATE POLICY "Users can view antivirus status in their tenant" ON antivirus_status
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'operator', 'viewer', 'super_admin')
    )
  );

-- 3. Atualizar policy de software_inventory
DROP POLICY IF EXISTS "Admins can view software inventory in their tenant" ON software_inventory;
CREATE POLICY "Users can view software inventory in their tenant" ON software_inventory
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'operator', 'viewer', 'super_admin')
    )
  );

-- 4. Atualizar policy de vuln_findings
DROP POLICY IF EXISTS "Users can view vuln findings in their tenant" ON vuln_findings;
CREATE POLICY "Users can view vuln findings in their tenant" ON vuln_findings
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'operator', 'viewer', 'super_admin')
    )
  );