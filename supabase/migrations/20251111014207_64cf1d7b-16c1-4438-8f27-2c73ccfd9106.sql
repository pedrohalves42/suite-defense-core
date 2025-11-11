-- FASE 1: Correções de RLS Policies (CRÍTICO)

-- 1.1 RLS Policies para user_roles
CREATE POLICY "users_can_view_own_roles" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "super_admins_can_view_all_roles" ON user_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- 1.2 RLS Policies para tenants
CREATE POLICY "users_can_view_own_tenant" ON tenants
  FOR SELECT USING (
    id IN (
      SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "super_admins_can_view_all_tenants" ON tenants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- 1.3 RLS Policies para invites
CREATE POLICY "admins_can_view_tenant_invites" ON invites
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admins_can_create_invites" ON invites
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admins_can_delete_tenant_invites" ON invites
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 1.4 RLS Policies para audit_logs
CREATE POLICY "admins_can_view_tenant_logs" ON audit_logs
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "super_admins_can_view_all_logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );