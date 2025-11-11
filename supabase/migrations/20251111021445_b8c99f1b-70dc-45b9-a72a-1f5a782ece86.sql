-- Migration 1: Adicionar campos OS à tabela agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS os_type TEXT CHECK (os_type IN ('windows', 'linux', 'unknown'));
ALTER TABLE agents ADD COLUMN IF NOT EXISTS os_version TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS hostname TEXT;

-- Atualizar agents existentes
UPDATE agents SET os_type = 'unknown' WHERE os_type IS NULL;

-- Migration 2: Criar tabela agent_system_metrics
CREATE TABLE IF NOT EXISTS agent_system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- CPU Metrics
  cpu_usage_percent DECIMAL(5,2),
  cpu_name TEXT,
  cpu_cores INTEGER,
  
  -- Memory Metrics
  memory_total_gb DECIMAL(10,2),
  memory_used_gb DECIMAL(10,2),
  memory_free_gb DECIMAL(10,2),
  memory_usage_percent DECIMAL(5,2),
  
  -- Disk Metrics
  disk_total_gb DECIMAL(10,2),
  disk_used_gb DECIMAL(10,2),
  disk_free_gb DECIMAL(10,2),
  disk_usage_percent DECIMAL(5,2),
  
  -- Network Metrics
  network_bytes_sent BIGINT,
  network_bytes_received BIGINT,
  
  -- System Info
  uptime_seconds BIGINT,
  last_boot_time TIMESTAMPTZ,
  
  -- Metadata
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_agent_system_metrics_agent_id ON agent_system_metrics(agent_id);
CREATE INDEX idx_agent_system_metrics_tenant_id ON agent_system_metrics(tenant_id);
CREATE INDEX idx_agent_system_metrics_collected_at ON agent_system_metrics(collected_at DESC);

-- RLS Policies
ALTER TABLE agent_system_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view tenant metrics" ON agent_system_metrics
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Super admins can view all metrics" ON agent_system_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Cleanup automático de métricas antigas
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM agent_system_metrics
  WHERE collected_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Migration 3: Criar tabela system_alerts
CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'agent_offline', 
    'high_cpu', 
    'high_memory', 
    'high_disk', 
    'job_failed', 
    'security_threat'
  )),
  
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_system_alerts_tenant_id ON system_alerts(tenant_id);
CREATE INDEX idx_system_alerts_agent_id ON system_alerts(agent_id);
CREATE INDEX idx_system_alerts_created_at ON system_alerts(created_at DESC);
CREATE INDEX idx_system_alerts_unacknowledged ON system_alerts(acknowledged) WHERE NOT acknowledged;

-- RLS Policies
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view tenant alerts" ON system_alerts
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update tenant alerts" ON system_alerts
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Super admins can view all alerts" ON system_alerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update all alerts" ON system_alerts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Migration 4: Função para obter últimas métricas por agente
CREATE OR REPLACE FUNCTION get_latest_agent_metrics(p_tenant_id UUID)
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  os_type TEXT,
  os_version TEXT,
  hostname TEXT,
  status TEXT,
  last_heartbeat TIMESTAMPTZ,
  cpu_usage_percent DECIMAL,
  memory_usage_percent DECIMAL,
  disk_usage_percent DECIMAL,
  uptime_seconds BIGINT,
  metrics_age_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (a.id)
    a.id,
    a.agent_name,
    a.os_type,
    a.os_version,
    a.hostname,
    a.status,
    a.last_heartbeat,
    m.cpu_usage_percent,
    m.memory_usage_percent,
    m.disk_usage_percent,
    m.uptime_seconds,
    EXTRACT(EPOCH FROM (NOW() - m.collected_at))::INTEGER / 60 AS metrics_age_minutes
  FROM agents a
  LEFT JOIN agent_system_metrics m ON a.id = m.agent_id
  WHERE a.tenant_id = p_tenant_id
  ORDER BY a.id, m.collected_at DESC NULLS LAST;
END;
$$;