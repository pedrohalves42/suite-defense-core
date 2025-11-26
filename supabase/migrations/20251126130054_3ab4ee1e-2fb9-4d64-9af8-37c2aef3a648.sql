-- Fase 2: Registrar v3.10.9-PSCUSTOMOBJECT-FIX no agent_releases
-- Fase 3: Criar update_agent jobs para os 4 agentes
-- Fase 4: Criar security jobs de teste

-- Desativar todas as versoes anteriores
UPDATE public.agent_releases
SET is_active = false
WHERE platform = 'windows';

-- Registrar v3.10.9-PSCUSTOMOBJECT-FIX (copiando conteudo da v3.10.8)
INSERT INTO public.agent_releases (
  version,
  platform,
  script_content,
  sha256,
  channel,
  is_active,
  release_notes
)
SELECT
  'v3.10.9-PSCUSTOMOBJECT-FIX',
  'windows',
  script_content,
  sha256,
  'stable',
  true,
  'CRITICAL FIX: Replaced $Job.ContainsKey("payload") with $null -ne $Job.payload for PSCustomObject compatibility. All job handlers updated to use null check pattern instead of hashtable methods.'
FROM public.agent_releases
WHERE version = 'v3.10.8-AGENT-ID-FIX'
LIMIT 1;

-- Fase 3: Criar update_agent jobs para os 4 agentes
INSERT INTO public.jobs (
  tenant_id,
  agent_id,
  agent_name,
  type,
  status,
  payload,
  approved
)
SELECT
  a.tenant_id,
  a.id,
  a.agent_name,
  'update_agent',
  'queued',
  jsonb_build_object(
    'currentVersion', a.agent_version,
    'targetVersion', 'v3.10.9-PSCUSTOMOBJECT-FIX'
  ),
  true
FROM public.agents a
WHERE a.agent_name IN ('testepc2', 'BMGTESTE', 'TESTEMIT', 'testepc1')
  AND a.status = 'active';

-- Fase 4: Criar security jobs de teste para cada agente
INSERT INTO public.jobs (
  tenant_id,
  agent_id,
  agent_name,
  type,
  status,
  payload,
  approved
)
SELECT
  a.tenant_id,
  a.id,
  a.agent_name,
  job_type,
  'queued',
  '{}'::jsonb,
  true
FROM public.agents a
CROSS JOIN (
  VALUES
    ('software_inventory_collect'),
    ('collect_antivirus_status'),
    ('collect_web_activity')
) AS job_types(job_type)
WHERE a.agent_name IN ('testepc2', 'BMGTESTE', 'TESTEMIT', 'testepc1')
  AND a.status = 'active';