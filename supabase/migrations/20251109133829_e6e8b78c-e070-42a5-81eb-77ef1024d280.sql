-- Criar tabela de quarentena
CREATE TABLE IF NOT EXISTS public.quarantined_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  agent_name text NOT NULL,
  file_path text NOT NULL,
  file_hash text NOT NULL,
  virus_scan_id uuid REFERENCES public.virus_scans(id),
  quarantined_at timestamp with time zone NOT NULL DEFAULT now(),
  quarantine_reason text NOT NULL,
  restored_at timestamp with time zone,
  restored_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'quarantined' CHECK (status IN ('quarantined', 'restored', 'deleted')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Criar índices para performance
CREATE INDEX idx_quarantined_files_tenant ON public.quarantined_files(tenant_id);
CREATE INDEX idx_quarantined_files_status ON public.quarantined_files(status);
CREATE INDEX idx_quarantined_files_agent ON public.quarantined_files(agent_name);

-- Habilitar RLS
ALTER TABLE public.quarantined_files ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para quarantined_files
CREATE POLICY "Admins can manage quarantined files in their tenant"
ON public.quarantined_files
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Operators can view quarantined files in their tenant"
ON public.quarantined_files
FOR SELECT
TO authenticated
USING ((has_role(auth.uid(), 'operator'::app_role) OR has_role(auth.uid(), 'viewer'::app_role)) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Service role has full access to quarantined files"
ON public.quarantined_files
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Atualizar TODOS os usuários existentes para admin
UPDATE public.user_roles
SET role = 'admin'::app_role
WHERE role != 'admin'::app_role;

-- Garantir que pedrohalves42@gmail.com seja admin (se existir)
DO $$
DECLARE
  target_user_id uuid;
  target_tenant_id uuid;
BEGIN
  -- Buscar o user_id do email especificado
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = 'pedrohalves42@gmail.com';
  
  -- Se o usuário existe
  IF target_user_id IS NOT NULL THEN
    -- Buscar tenant_id do usuário
    SELECT tenant_id INTO target_tenant_id
    FROM public.user_roles
    WHERE user_id = target_user_id
    LIMIT 1;
    
    -- Atualizar role para admin
    UPDATE public.user_roles
    SET role = 'admin'::app_role
    WHERE user_id = target_user_id;
  END IF;
END $$;