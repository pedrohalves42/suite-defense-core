-- 1. Fortificação do Upload de Scripts (Correção B1.2)
DROP POLICY IF EXISTS "admins_can_upload_agent_scripts" ON storage.objects;

CREATE POLICY "admins_can_upload_agent_scripts_isolated" ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'agent-scripts' 
  AND (storage.foldername(name))[1] = public.get_active_tenant_id()::text
  AND public.has_role(auth.uid(), 'admin', public.get_active_tenant_id())
);

-- 2. Garantir isolamento no DELETE para ambos os buckets
DROP POLICY IF EXISTS "admins_can_delete_own_installers" ON storage.objects;
CREATE POLICY "admins_can_delete_own_installers" ON storage.objects FOR DELETE 
TO authenticated
USING (
  bucket_id = 'agent-installers' 
  AND (storage.foldername(name))[1] = public.get_active_tenant_id()::text
  AND public.has_role(auth.uid(), 'admin', public.get_active_tenant_id())
);

DROP POLICY IF EXISTS "admins_can_delete_own_scripts" ON storage.objects;
CREATE POLICY "admins_can_delete_own_scripts" ON storage.objects FOR DELETE 
TO authenticated
USING (
  bucket_id = 'agent-scripts' 
  AND (storage.foldername(name))[1] = public.get_active_tenant_id()::text
  AND public.has_role(auth.uid(), 'admin', public.get_active_tenant_id())
);
