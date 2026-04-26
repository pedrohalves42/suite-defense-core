-- ============================================================================
-- PLANO CONSOLIDADO DE CORRECAO - v3.10.9-PSCUSTOMOBJECT-FIX
-- ============================================================================

-- FASE 1: Corrigir agent_releases com SHA256 Real
-- ============================================================================
UPDATE public.agent_releases
SET
  sha256 = '7d04be725bb14cc5a5f5ad99a4380d2304cdfbb4305cbea1548cb06b0488a9e7',
  is_active = true
WHERE version = 'v3.10.9-PSCUSTOMOBJECT-FIX'
  AND platform = 'windows';

-- Desativar versoes antigas (manter apenas v3.10.9 ativa)
UPDATE public.agent_releases
SET is_active = false
WHERE platform = 'windows'
  AND version != 'v3.10.9-PSCUSTOMOBJECT-FIX';

-- FASE 2: Criar Jobs de Seguranca para testepc1
-- ============================================================================
-- Agent: testepc1
-- Agent ID: b393abc6-c507-4a4c-9c40-4c4593974ebe
-- Tenant ID: 3adc67e6-8908-4d98-b85b-5e93be4673a1

INSERT INTO public.jobs (tenant_id, agent_id, agent_name, type, status, payload, created_at)
VALUES
  -- Software Inventory Collection
  (
    '3adc67e6-8908-4d98-b85b-5e93be4673a1'::uuid,
    'b393abc6-c507-4a4c-9c40-4c4593974ebe'::uuid,
    'testepc1',
    'software_inventory_collect',
    'queued',
    '{}'::jsonb,
    NOW()
  ),
  -- Antivirus Status Collection
  (
    '3adc67e6-8908-4d98-b85b-5e93be4673a1'::uuid,
    'b393abc6-c507-4a4c-9c40-4c4593974ebe'::uuid,
    'testepc1',
    'collect_antivirus_status',
    'queued',
    '{}'::jsonb,
    NOW()
  ),
  -- Light Vulnerability Scan
  (
    '3adc67e6-8908-4d98-b85b-5e93be4673a1'::uuid,
    'b393abc6-c507-4a4c-9c40-4c4593974ebe'::uuid,
    'testepc1',
    'light_vuln_scan',
    'queued',
    '{}'::jsonb,
    NOW()
  );

-- FASE 3: Limpar Update Jobs Antigos e Recriar
-- ============================================================================

-- 3.1. Limpar jobs de update com placeholder SHA (ultimas 24h)
DELETE FROM public.jobs
WHERE type = 'update_agent'
  AND status IN ('failed', 'delivered')
  AND created_at > NOW() - INTERVAL '1 day';

-- 3.2. Criar novos jobs de update para BMGTESTE e testepc2
INSERT INTO public.jobs (tenant_id, agent_id, agent_name, type, status, payload, created_at)
SELECT
  a.tenant_id,
  a.id,
  a.agent_name,
  'update_agent',
  'queued',
  jsonb_build_object(
    'target_version', 'v3.10.9-PSCUSTOMOBJECT-FIX',
    'platform', 'windows',
    'force_update', true
  ),
  NOW()
FROM public.agents a
WHERE a.agent_name IN ('BMGTESTE', 'testepc2')
  AND a.status = 'active'
  AND (a.agent_version IS NULL OR a.agent_version NOT LIKE '%3.10.9%');