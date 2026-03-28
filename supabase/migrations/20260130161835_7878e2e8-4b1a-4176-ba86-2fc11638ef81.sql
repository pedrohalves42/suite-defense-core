-- P0: Corrigir RLS de notification_channels com politicas separadas e WITH CHECK explicito

-- Remover politica problematica (FOR ALL sem WITH CHECK)
DROP POLICY IF EXISTS notification_channels_all_active_tenant ON notification_channels;

-- Criar politicas separadas por operacao com WITH CHECK explicito

-- SELECT: Usuarios autenticados podem ler canais do seu tenant ativo
CREATE POLICY notification_channels_select_authenticated ON notification_channels
  FOR SELECT TO authenticated
  USING (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );

-- INSERT: Usuarios autenticados podem inserir canais no seu tenant ativo
CREATE POLICY notification_channels_insert_authenticated ON notification_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );

-- UPDATE: Usuarios autenticados podem atualizar canais do seu tenant ativo
CREATE POLICY notification_channels_update_authenticated ON notification_channels
  FOR UPDATE TO authenticated
  USING (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  )
  WITH CHECK (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );

-- DELETE: Usuarios autenticados podem deletar canais do seu tenant ativo
CREATE POLICY notification_channels_delete_authenticated ON notification_channels
  FOR DELETE TO authenticated
  USING (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );