-- ============================================
-- PHASE 1: Fix Cross-Tenant Profile Exposure
-- ============================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "admins_can_read_all_profiles" ON profiles;
DROP POLICY IF EXISTS "admins_can_update_all_profiles" ON profiles;

-- Create new tenant-isolated policy for admin SELECT
CREATE POLICY "admins_can_read_tenant_profiles" ON profiles
FOR SELECT TO authenticated
USING (
  -- User can always read their own profile
  auth.uid() = user_id 
  OR 
  -- Super admins can read all profiles (needed for system administration)
  is_super_admin(auth.uid())
  OR
  -- Admins can only read profiles of users in their own tenant
  EXISTS (
    SELECT 1 FROM user_roles admin_role
    WHERE admin_role.user_id = auth.uid()
    AND admin_role.role = 'admin'
    AND admin_role.tenant_id IN (
      SELECT ur.tenant_id FROM user_roles ur 
      WHERE ur.user_id = profiles.user_id
    )
  )
);

-- Create new tenant-isolated policy for admin UPDATE
CREATE POLICY "admins_can_update_tenant_profiles" ON profiles
FOR UPDATE TO authenticated
USING (
  -- User can always update their own profile
  auth.uid() = user_id 
  OR 
  -- Super admins can update all profiles
  is_super_admin(auth.uid())
  OR
  -- Admins can only update profiles of users in their own tenant
  EXISTS (
    SELECT 1 FROM user_roles admin_role
    WHERE admin_role.user_id = auth.uid()
    AND admin_role.role = 'admin'
    AND admin_role.tenant_id IN (
      SELECT ur.tenant_id FROM user_roles ur 
      WHERE ur.user_id = profiles.user_id
    )
  )
)
WITH CHECK (
  auth.uid() = user_id 
  OR 
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM user_roles admin_role
    WHERE admin_role.user_id = auth.uid()
    AND admin_role.role = 'admin'
    AND admin_role.tenant_id IN (
      SELECT ur.tenant_id FROM user_roles ur 
      WHERE ur.user_id = profiles.user_id
    )
  )
);

-- ============================================
-- PHASE 2: Secure Sales Contact Inserts
-- ============================================

-- Remove the public INSERT policy - all submissions must go through Edge Function
DROP POLICY IF EXISTS "public_can_create_sales_contacts" ON sales_contacts;

-- Add a comment explaining why there's no public INSERT policy
COMMENT ON TABLE sales_contacts IS 'Contact form submissions. All inserts must go through submit-contact Edge Function which provides rate limiting, validation, and audit logging.';