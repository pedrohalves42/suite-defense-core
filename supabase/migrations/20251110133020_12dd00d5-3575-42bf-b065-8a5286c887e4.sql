-- Drop existing policies to recreate them with proper role targeting
DROP POLICY IF EXISTS "Admins can view all roles in their tenant" ON public.user_roles;
DROP POLICY IF EXISTS "Operators can view roles in their tenant" ON public.user_roles;

-- Recreate policies with TO authenticated for better security
CREATE POLICY "Admins can view all roles in their tenant"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND tenant_id = current_user_tenant_id()
);

CREATE POLICY "Operators can view roles in their tenant"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'operator'::app_role) 
  AND tenant_id = current_user_tenant_id()
);

COMMENT ON POLICY "Admins can view all roles in their tenant" ON public.user_roles IS 
'Allows authenticated admins to see all user roles within their tenant';

COMMENT ON POLICY "Operators can view roles in their tenant" ON public.user_roles IS 
'Allows authenticated operators to view user roles within their tenant';