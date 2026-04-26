
-- =====================================================
-- SECURITY FIX: enrollment_keys - Restrict to admins only
-- Vulnerability: Any tenant user can view enrollment key metadata
-- Fix: Only admins can access enrollment keys
-- =====================================================

-- Drop vulnerable policies
DROP POLICY IF EXISTS "enrollment_keys_select_active_tenant" ON enrollment_keys;
DROP POLICY IF EXISTS "enrollment_keys_insert_active_tenant" ON enrollment_keys;
DROP POLICY IF EXISTS "enrollment_keys_update_active_tenant" ON enrollment_keys;
DROP POLICY IF EXISTS "enrollment_keys_delete_active_tenant" ON enrollment_keys;

-- Create secure policies: Only admins can access enrollment keys
CREATE POLICY "enrollment_keys_select_admin_only" ON enrollment_keys
FOR SELECT USING (
  is_current_super_admin() OR
  (tenant_id = get_active_tenant_id() AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin')
      AND ur.tenant_id = get_active_tenant_id()
  ))
);

CREATE POLICY "enrollment_keys_insert_admin_only" ON enrollment_keys
FOR INSERT WITH CHECK (
  is_current_super_admin() OR
  (tenant_id = get_active_tenant_id() AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin')
      AND ur.tenant_id = get_active_tenant_id()
  ))
);

CREATE POLICY "enrollment_keys_update_admin_only" ON enrollment_keys
FOR UPDATE USING (
  is_current_super_admin() OR
  (tenant_id = get_active_tenant_id() AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin')
      AND ur.tenant_id = get_active_tenant_id()
  ))
) WITH CHECK (
  is_current_super_admin() OR
  (tenant_id = get_active_tenant_id() AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin')
      AND ur.tenant_id = get_active_tenant_id()
  ))
);

CREATE POLICY "enrollment_keys_delete_admin_only" ON enrollment_keys
FOR DELETE USING (
  is_current_super_admin() OR
  (tenant_id = get_active_tenant_id() AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin')
      AND ur.tenant_id = get_active_tenant_id()
  ))
);

-- Add security comments
COMMENT ON POLICY "enrollment_keys_select_admin_only" ON enrollment_keys IS
'SECURITY: Enrollment keys restricted to admins to prevent unauthorized agent enrollment attacks';

-- =====================================================
-- SECURITY FIX: tasks - Implement proper RBAC for updates
-- Vulnerability: Any tenant user can close security tasks
-- Fix: Only assigned_to user OR admin can update
-- =====================================================

-- Drop vulnerable policy
DROP POLICY IF EXISTS "tasks_update_active_tenant" ON tasks;

-- Create RBAC policy for task updates
CREATE POLICY "tasks_update_rbac" ON tasks
FOR UPDATE USING (
  is_current_super_admin() OR
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id() AND (
    -- Assigned user can update their own tasks
    assigned_to = auth.uid() OR
    -- Admins can update any task in their tenant
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'operator')
        AND ur.tenant_id = get_active_tenant_id()
    )
  ))
) WITH CHECK (
  is_current_super_admin() OR
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
);

-- Add security comment
COMMENT ON POLICY "tasks_update_rbac" ON tasks IS
'SECURITY: RBAC for task updates - only assigned user OR admin/operator can modify tasks';
