
DROP POLICY IF EXISTS "group_members_admin_insert" ON public.group_members;
DROP POLICY IF EXISTS "group_members_admin_delete" ON public.group_members;

CREATE POLICY "group_members_admin_insert" ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_active_tenant_id()
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "group_members_admin_delete" ON public.group_members
  FOR DELETE TO authenticated
  USING (
    tenant_id = get_active_tenant_id()
    AND public.has_role(auth.uid(), 'admin')
  );
