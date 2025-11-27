-- Fase 1: Desativar todas as versoes antigas do Windows
UPDATE public.agent_releases 
SET is_active = false 
WHERE platform = 'windows';

-- Fase 2: Inserir v3.10.9-PSCUSTOMOBJECT-FIX (se nao existir)
INSERT INTO public.agent_releases (
  version, platform, channel, 
  script_content, sha256, 
  release_notes, is_active
)
SELECT 
  'v3.10.9-PSCUSTOMOBJECT-FIX',
  'windows',
  'stable',
  '# Placeholder - sera atualizado via Edge Function',
  'placeholder-sha256-to-be-calculated',
  'CRITICAL FIX: Corrige $Job.ContainsKey() para $null -ne $Job.payload em todos os job handlers. Resolve incompatibilidade PSCustomObject vs Hashtable.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_releases 
  WHERE version = 'v3.10.9-PSCUSTOMOBJECT-FIX' 
    AND platform = 'windows'
);

-- Se ja existir, apenas ativar
UPDATE public.agent_releases
SET is_active = true,
    release_notes = 'CRITICAL FIX: Corrige $Job.ContainsKey() para $null -ne $Job.payload em todos os job handlers. Resolve incompatibilidade PSCustomObject vs Hashtable.'
WHERE version = 'v3.10.9-PSCUSTOMOBJECT-FIX' 
  AND platform = 'windows';

-- Fase 3: Criar update_agent jobs para agentes desatualizados
INSERT INTO public.jobs (
  agent_name, agent_id, type, status, payload, tenant_id
)
SELECT 
  a.agent_name,
  a.id,
  'update_agent',
  'queued',
  jsonb_build_object(
    'target_version', 'v3.10.9-PSCUSTOMOBJECT-FIX',
    'platform', 'windows',
    'force_update', true
  ),
  a.tenant_id
FROM public.agents a
WHERE a.os_type = 'windows'
  AND a.status = 'active'
  AND (a.agent_version IS NULL OR a.agent_version NOT LIKE '%3.10.9%');