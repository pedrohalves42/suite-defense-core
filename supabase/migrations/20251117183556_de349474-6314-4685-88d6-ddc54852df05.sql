-- ============================================
-- FASE 2: Criar tabela agent_releases
-- ============================================

CREATE TABLE IF NOT EXISTS public.agent_releases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version        text NOT NULL,
  platform       text NOT NULL DEFAULT 'windows',
  channel        text NOT NULL DEFAULT 'stable',
  script_content text NOT NULL,
  sha256         text NOT NULL,
  release_notes  text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id)
);

-- Indice unico para version + platform + channel
CREATE UNIQUE INDEX idx_agent_releases_version_platform
  ON public.agent_releases (version, platform, channel);

-- Indice para consultas de releases ativas
CREATE INDEX idx_agent_releases_active
  ON public.agent_releases (is_active, platform, channel)
  WHERE is_active = true;

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE public.agent_releases ENABLE ROW LEVEL SECURITY;

-- Super admins podem gerenciar releases
CREATE POLICY "Super admins can manage releases"
  ON public.agent_releases FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Agents podem ler releases ativas (via Edge Function com service role)
CREATE POLICY "Agents can read active releases"
  ON public.agent_releases FOR SELECT
  USING (is_active = true);

-- ============================================
-- Comentarios
-- ============================================

COMMENT ON TABLE public.agent_releases IS 'Armazena versoes do agente para auto-update';
COMMENT ON COLUMN public.agent_releases.version IS 'Versao semantica (e.g., 3.1.0)';
COMMENT ON COLUMN public.agent_releases.platform IS 'Plataforma: windows, linux, macos';
COMMENT ON COLUMN public.agent_releases.channel IS 'Canal de release: stable, beta, alpha';
COMMENT ON COLUMN public.agent_releases.script_content IS 'Conteudo completo do script PowerShell/Bash';
COMMENT ON COLUMN public.agent_releases.sha256 IS 'Hash SHA256 do script_content para validacao';
COMMENT ON COLUMN public.agent_releases.is_active IS 'Apenas releases ativas podem ser baixadas';