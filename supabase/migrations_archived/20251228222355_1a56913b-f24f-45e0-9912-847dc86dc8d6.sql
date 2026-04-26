-- Politica INSERT para tenant_settings
CREATE POLICY "tenant_settings_insert_multitenant" ON public.tenant_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Politica DELETE para tenant_settings
CREATE POLICY "tenant_settings_delete_multitenant" ON public.tenant_settings
  FOR DELETE
  TO authenticated
  USING (public.user_has_tenant_access(tenant_id));