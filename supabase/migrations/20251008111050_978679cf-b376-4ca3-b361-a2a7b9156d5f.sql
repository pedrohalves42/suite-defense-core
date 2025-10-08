-- Criar tabelas para o sistema CyberShield

-- Tabela de agentes
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL UNIQUE,
  agent_token TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL DEFAULT 'dev',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
);

-- Tabela de jobs
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB,
  approved BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Tabela de relatórios
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_jobs_agent_status ON public.jobs(agent_name, status);
CREATE INDEX idx_reports_agent ON public.reports(agent_name, created_at DESC);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (permitir acesso público para desenvolvimento - ajustar em produção)
CREATE POLICY "Allow public access to agents" ON public.agents FOR ALL USING (true);
CREATE POLICY "Allow public access to jobs" ON public.jobs FOR ALL USING (true);
CREATE POLICY "Allow public access to reports" ON public.reports FOR ALL USING (true);