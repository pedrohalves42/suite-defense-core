-- Create function to check super_admin role
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role = 'super_admin'
  )
$$;

-- Allow super_admins to view all tenants
CREATE POLICY "Super admins can view all tenants"
ON public.tenants
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- Allow super_admins to manage all tenant subscriptions
CREATE POLICY "Super admins can manage all subscriptions"
ON public.tenant_subscriptions
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Allow super_admins to view all user roles
CREATE POLICY "Super admins can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- Allow super_admins to view all agents
CREATE POLICY "Super admins can view all agents"
ON public.agents
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- Allow super_admins to view all virus scans
CREATE POLICY "Super admins can view all virus scans"
ON public.virus_scans
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- Allow super_admins to view all tenant features
CREATE POLICY "Super admins can view all tenant features"
ON public.tenant_features
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));