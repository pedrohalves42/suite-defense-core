-- Criar tabela para versionamento de agentes
CREATE TABLE IF NOT EXISTS public.agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'linux')),
  sha256 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  download_url TEXT NOT NULL,
  is_latest BOOLEAN DEFAULT false,
  release_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(version, platform)
);

-- Criar indice para buscar ultima versao
CREATE INDEX IF NOT EXISTS idx_agent_versions_latest 
ON public.agent_versions(platform, is_latest, created_at DESC);

-- Habilitar RLS
ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;

-- Politica: Agentes podem ler versoes (para auto-update)
CREATE POLICY "agents_can_read_versions"
ON public.agent_versions
FOR SELECT
TO authenticated
USING (true);

-- Politica: Super admins podem gerenciar versoes
CREATE POLICY "super_admins_can_manage_versions"
ON public.agent_versions
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Trigger para garantir apenas uma versao latest por plataforma
CREATE OR REPLACE FUNCTION public.ensure_single_latest_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_latest = true THEN
    -- Marcar todas as outras versoes da mesma plataforma como nao-latest
    UPDATE public.agent_versions
    SET is_latest = false
    WHERE platform = NEW.platform
      AND id != NEW.id
      AND is_latest = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER ensure_single_latest_version_trigger
BEFORE INSERT OR UPDATE ON public.agent_versions
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_latest_version();

COMMENT ON TABLE public.agent_versions IS 'Armazena versoes do agente Python para auto-update';
COMMENT ON COLUMN public.agent_versions.version IS 'Versao semantica (e.g., 1.0.0)';
COMMENT ON COLUMN public.agent_versions.platform IS 'Plataforma (windows ou linux)';
COMMENT ON COLUMN public.agent_versions.sha256 IS 'Hash SHA256 do executavel';
COMMENT ON COLUMN public.agent_versions.size_bytes IS 'Tamanho do arquivo em bytes';
COMMENT ON COLUMN public.agent_versions.download_url IS 'URL publica para download';
COMMENT ON COLUMN public.agent_versions.is_latest IS 'Se e a versao mais recente para a plataforma';
COMMENT ON COLUMN public.agent_versions.release_notes IS 'Notas de lancamento em Markdown';