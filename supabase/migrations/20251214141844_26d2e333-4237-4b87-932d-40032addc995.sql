-- Fix CVE database RLS policy - restrict to authenticated tenant members only
DROP POLICY IF EXISTS "Authenticated users can view CVE database" ON public.cve_database;

CREATE POLICY "Tenant members can view CVE database" ON public.cve_database
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'operator', 'viewer', 'super_admin')
    )
  );