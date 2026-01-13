
-- Fix agent_releases RLS - restrict SELECT to admin only for inactive releases
DROP POLICY IF EXISTS "authenticated_select_agent_releases" ON public.agent_releases;
DROP POLICY IF EXISTS "agent_releases_select_authenticated" ON public.agent_releases;
DROP POLICY IF EXISTS "agent_releases_select_super_admin" ON public.agent_releases;
DROP POLICY IF EXISTS "agent_releases_all_super_admin" ON public.agent_releases;

-- Only show active releases to authenticated users, all releases to admins
CREATE POLICY "agent_releases_select_active_or_admin"
ON public.agent_releases
FOR SELECT TO authenticated
USING (
  is_active = true
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

-- Super admins can manage all releases
CREATE POLICY "agent_releases_manage_super_admin"
ON public.agent_releases
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
