-- ============================================
-- REGISTRAR AGENTE v3.10.13-AUTO-UPDATE-SAFE
-- ============================================

-- 1. Desativar todas as versoes Windows anteriores
UPDATE public.agent_releases
SET is_active = false
WHERE platform = 'windows'
  AND is_active = true;

-- 2. Buscar script da versao mais recente e atualizar o parametro $AgentVersion
-- Calcular novo SHA256 baseado no script atualizado
WITH latest_script AS (
  SELECT script_content
  FROM public.agent_releases
  WHERE platform = 'windows'
  ORDER BY created_at DESC
  LIMIT 1
),
updated_script AS (
  SELECT REPLACE(
    script_content,
    '[string]$AgentVersion = "3.10.12-UPDATE-PATH-AGENTNAME-FIX"',
    '[string]$AgentVersion = "3.10.13-AUTO-UPDATE-SAFE"'
  ) as new_script
  FROM latest_script
)
INSERT INTO public.agent_releases (
  version,
  platform,
  channel,
  script_content,
  sha256,
  is_active,
  release_notes
)
SELECT
  'v3.10.13-AUTO-UPDATE-SAFE',
  'windows',
  'stable',
  new_script,
  encode(digest(convert_to(new_script, 'UTF8'), 'sha256'), 'hex'),
  true,
  'Critical fix: Agent auto-update now correctly handles update failures without permanently exiting. Wrapped Execute-Job in try-catch to ensure exit 0 only occurs on successful updates, allowing agent to continue normal operation if update fails.'
FROM updated_script;
