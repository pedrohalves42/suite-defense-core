-- P0: Corrigir RLS de notification_channels com políticas separadas e WITH CHECK explícito

-- Remover política problemática (FOR ALL sem WITH CHECK)
DROP POLICY IF EXISTS notification_channels_all_active_tenant ON notification_channels;

-- Criar políticas separadas por operação com WITH CHECK explícito

-- SELECT: Usuários autenticados podem ler canais do seu tenant ativo
CREATE POLICY notification_channels_select_authenticated ON notification_channels
  FOR SELECT TO authenticated
  USING (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );

-- INSERT: Usuários autenticados podem inserir canais no seu tenant ativo
CREATE POLICY notification_channels_insert_authenticated ON notification_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );

-- UPDATE: Usuários autenticados podem atualizar canais do seu tenant ativo
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

-- DELETE: Usuários autenticados podem deletar canais do seu tenant ativo
CREATE POLICY notification_channels_delete_authenticated ON notification_channels
  FOR DELETE TO authenticated
  USING (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );