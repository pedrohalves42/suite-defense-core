-- ========================================
-- FASE 1: ROLLOUT GRADUAL - AGENT UPDATE POLICIES
-- Controle granular de deploy de updates
-- ========================================

-- Tabela de politicas de rollout por plataforma
CREATE TABLE public.agent_update_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('windows', 'linux', 'macos')),
  target_version text NOT NULL,
  rollout_percentage integer NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  enabled boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(platform) -- Uma policy ativa por plataforma
);

-- Enable RLS
ALTER TABLE public.agent_update_policies ENABLE ROW LEVEL SECURITY;

-- Apenas super_admin pode gerenciar politicas de rollout
CREATE POLICY "super_admin_manage_rollout_policies" ON public.agent_update_policies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Trigger para updated_at
CREATE TRIGGER update_agent_update_policies_updated_at
  BEFORE UPDATE ON public.agent_update_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tenant_settings_updated_at();

-- Indice para busca por plataforma
CREATE INDEX idx_agent_update_policies_platform ON public.agent_update_policies(platform);

-- Comentario explicativo
COMMENT ON TABLE public.agent_update_policies IS 'Politicas de rollout gradual para updates de agentes. Permite controle de % de rollout e kill switch por plataforma.';
COMMENT ON COLUMN public.agent_update_policies.rollout_percentage IS 'Percentual de agentes que receberao o update (0-100). Bucket deterministico via SHA256(agent_id).';
COMMENT ON COLUMN public.agent_update_policies.enabled IS 'Kill switch: false = NENHUM agente recebe update, independente do percentual.';