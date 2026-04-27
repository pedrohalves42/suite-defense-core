-- Drop existing potentially insecure or overlapping policies
DROP POLICY IF EXISTS "ai_actions_tenant_isolation" ON public.ai_actions;
DROP POLICY IF EXISTS "ai_actions_select_admin_analyst" ON public.ai_actions;
DROP POLICY IF EXISTS "ai_actions_update_admin_only" ON public.ai_actions;
DROP POLICY IF EXISTS "Users can view actions for their tenant" ON public.ai_actions;

-- 1. Tighten SELECT policy: check user_roles directly in the database
CREATE POLICY "ai_actions_select_tenant_isolation" 
ON public.ai_actions 
FOR SELECT 
TO authenticated 
USING (
  is_current_super_admin() OR 
  tenant_id IN (
    SELECT ur.tenant_id 
    FROM user_roles ur 
    WHERE ur.user_id = auth.uid()
  )
);

-- 2. Tighten UPDATE policy: check user_roles and ensure proper role (admin or super_admin)
CREATE POLICY "ai_actions_update_tenant_isolation" 
ON public.ai_actions 
FOR UPDATE 
TO authenticated 
USING (
  is_current_super_admin() OR 
  (
    tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('admin', 'super_admin')
    )
  )
)
WITH CHECK (
  is_current_super_admin() OR 
  (
    tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('admin', 'super_admin')
    )
  )
);

-- Note: reasoning_summary and evidence_pack are columns in ai_actions. 
-- By enforcing row-level security based on tenant_id, users cannot access any data 
-- (including these columns) from other tenants.
