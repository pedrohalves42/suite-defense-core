
-- Backup Awareness: tabela para monitoramento de status de backup
CREATE TABLE public.backup_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Tipo de backup detectado
  backup_type TEXT NOT NULL DEFAULT 'unknown',  -- windows_backup, vss, third_party, cloud_sync, database_backup
  backup_tool TEXT,  -- nome da ferramenta (Windows Backup, Veeam, Acronis, OneDrive, etc.)
  
  -- Status
  status TEXT NOT NULL DEFAULT 'unknown',  -- ok, warning, critical, not_configured
  is_enabled BOOLEAN DEFAULT false,
  is_scheduled BOOLEAN DEFAULT false,
  
  -- Timestamps de backup
  last_backup_at TIMESTAMPTZ,
  next_scheduled_at TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ DEFAULT now(),
  
  -- Detalhes
  backup_target TEXT,  -- destino do backup (disco, nuvem, rede)
  backup_size_gb NUMERIC(10,2),
  backup_age_hours NUMERIC(10,1),
  error_message TEXT,
  
  -- Metadata
  details JSONB DEFAULT '{}',
  collected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique per agent + type + tool
  UNIQUE(agent_id, backup_type, backup_tool)
);

-- Indices
CREATE INDEX idx_backup_status_tenant ON public.backup_status(tenant_id);
CREATE INDEX idx_backup_status_agent ON public.backup_status(agent_id);
CREATE INDEX idx_backup_status_status ON public.backup_status(status);
CREATE INDEX idx_backup_status_critical ON public.backup_status(tenant_id, status) WHERE status IN ('critical', 'warning');

-- RLS
ALTER TABLE public.backup_status ENABLE ROW LEVEL SECURITY;

-- Policy: service_role full access
CREATE POLICY "service_role_full_access_backup_status" ON public.backup_status
  FOR ALL TO service_role USING (true);

-- Policy: authenticated users can read their tenant's data
CREATE POLICY "tenant_read_backup_status" ON public.backup_status
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
    )
  );

-- Enable realtime for backup alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.backup_status;
