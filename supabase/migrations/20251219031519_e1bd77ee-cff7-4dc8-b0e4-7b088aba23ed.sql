-- Criar tabela para armazenar metricas detalhadas de multiplos discos
CREATE TABLE public.agent_disk_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  drive_letter TEXT NOT NULL,
  drive_label TEXT,
  drive_type TEXT DEFAULT 'Fixed',
  
  total_gb NUMERIC NOT NULL,
  used_gb NUMERIC NOT NULL,
  free_gb NUMERIC NOT NULL,
  usage_percent NUMERIC NOT NULL,
  
  is_system_drive BOOLEAN DEFAULT false,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para performance
CREATE INDEX idx_disk_metrics_agent_id ON agent_disk_metrics(agent_id);
CREATE INDEX idx_disk_metrics_tenant_id ON agent_disk_metrics(tenant_id);
CREATE INDEX idx_disk_metrics_collected_at ON agent_disk_metrics(collected_at DESC);
CREATE INDEX idx_disk_metrics_agent_drive ON agent_disk_metrics(agent_id, drive_letter, collected_at DESC);

-- Habilitar RLS
ALTER TABLE agent_disk_metrics ENABLE ROW LEVEL SECURITY;

-- Politicas RLS
CREATE POLICY "Admins can view tenant disk metrics" ON agent_disk_metrics
  FOR SELECT
  USING (tenant_id IN (
    SELECT ur.tenant_id FROM user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role
  ));

CREATE POLICY "Super admins can view all disk metrics" ON agent_disk_metrics
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
  ));

CREATE POLICY "Service role can insert disk metrics" ON agent_disk_metrics
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can delete disk metrics" ON agent_disk_metrics
  FOR DELETE
  USING (true);

-- Funcao RPC para buscar detalhes dos discos de um agente
CREATE OR REPLACE FUNCTION public.get_agent_disk_details(p_agent_id uuid)
RETURNS TABLE(
  drive_letter text,
  drive_label text,
  drive_type text,
  total_gb numeric,
  used_gb numeric,
  free_gb numeric,
  usage_percent numeric,
  is_system_drive boolean,
  collected_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (dm.drive_letter)
    dm.drive_letter,
    dm.drive_label,
    dm.drive_type,
    dm.total_gb,
    dm.used_gb,
    dm.free_gb,
    dm.usage_percent,
    dm.is_system_drive,
    dm.collected_at
  FROM agent_disk_metrics dm
  WHERE dm.agent_id = p_agent_id
  ORDER BY dm.drive_letter, dm.collected_at DESC;
END;
$$;

-- Funcao para limpeza de metricas antigas (90 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_disk_metrics(retention_days integer DEFAULT 90)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM agent_disk_metrics
  WHERE collected_at < NOW() - (retention_days || ' days')::interval;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;