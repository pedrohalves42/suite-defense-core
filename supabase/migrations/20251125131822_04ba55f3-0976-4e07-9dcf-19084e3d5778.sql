-- Migration: v3.10.3-TLS-COMPLETE agent version and cleanup stuck jobs
-- Fase 3: Registrar v3.10.3-TLS-COMPLETE como versao mais recente
-- Fase 4: Limpar jobs update_agent stuck

-- Primeiro, desmarcar versoes antigas como is_latest
UPDATE agent_versions
SET is_latest = false
WHERE platform = 'windows' AND is_latest = true;

-- Inserir v3.10.3-TLS-COMPLETE como versao mais recente
INSERT INTO agent_versions (
    version,
    platform,
    download_url,
    sha256,
    size_bytes,
    is_latest,
    release_notes
)
VALUES (
    'v3.10.3-TLS-COMPLETE',
    'windows',
    'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-agent-update/v3.10.3-TLS-COMPLETE',
    'placeholder_sha256_will_be_updated_by_register_release',
    0,
    true,
    'CRITICAL FIX: TLS 1.2 em 3 camadas (comando irm + installer template + agent script) para compatibilidade total com Windows Server e ambientes corporativos. Resolve erros de download e heartbeat em redes com firewalls (pfSense).'
)
ON CONFLICT (version, platform) DO UPDATE
SET is_latest = true,
    release_notes = EXCLUDED.release_notes;

-- Limpar jobs update_agent stuck (pendentes ha mais de 6 horas)
UPDATE jobs
SET 
    status = 'failed',
    error_message = 'Job timeout - agente desatualizado nao processou update_agent em 6 horas',
    completed_at = now(),
    finished_at = now()
WHERE 
    type = 'update_agent' 
    AND status IN ('pending', 'queued', 'delivered')
    AND created_at < now() - interval '6 hours';

-- Registrar no agent_releases tambem
INSERT INTO agent_releases (
    version,
    platform,
    channel,
    script_content,
    sha256,
    is_active,
    release_notes
)
VALUES (
    'v3.10.3-TLS-COMPLETE',
    'windows',
    'stable',
    'placeholder_will_be_updated_by_register_release',
    'placeholder_sha256',
    true,
    'CRITICAL FIX: TLS 1.2 em 3 camadas (comando irm + installer template + agent script) para compatibilidade total com Windows Server e ambientes corporativos.'
)
ON CONFLICT (version, platform, channel) DO UPDATE
SET is_active = true,
    release_notes = EXCLUDED.release_notes;