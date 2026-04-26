-- Remove the overly permissive policy that exposes scim_api_key to all members
DROP POLICY IF EXISTS "tenants_select_active_tenant" ON public.tenants;