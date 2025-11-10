-- Add explicit SELECT policy for admins to view all roles in their tenant
-- This complements the existing ALL policy and provides clearer access
CREATE POLICY "Admins can view all roles in their tenant"
ON public.user_roles
FOR SELECT
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND tenant_id = current_user_tenant_id()
);

-- Also add a policy for operators to view roles in their tenant
CREATE POLICY "Operators can view roles in their tenant"
ON public.user_roles
FOR SELECT
TO public
USING (
  has_role(auth.uid(), 'operator'::app_role) 
  AND tenant_id = current_user_tenant_id()
);

COMMENT ON POLICY "Admins can view all roles in their tenant" ON public.user_roles IS 
'Allows admins to see all user roles within their tenant for user management';

COMMENT ON POLICY "Operators can view roles in their tenant" ON public.user_roles IS 
'Allows operators to view user roles within their tenant for monitoring purposes';