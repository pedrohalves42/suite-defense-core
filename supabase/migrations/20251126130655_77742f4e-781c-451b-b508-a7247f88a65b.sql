
-- ============================================================================
-- PLANO COMPLETO DE CORRECAO: 5 FASES
-- ============================================================================
-- Fase 1: Limpar jobs bloqueadores (payload NULL)
-- Fase 2: Corrigir SHA256 da v3.10.9-PSCUSTOMOBJECT-FIX
-- Fase 3: Criar update_agent jobs para testepc2, BMGTESTE, TESTEMIT
-- Fase 4: Criar security jobs para os 3 agentes
-- Fase 5: Instrucoes para reinstalacao do testepc1 (manual)
-- ============================================================================

-- ====================
-- FASE 1: LIMPAR JOBS BLOQUEADORES
-- ====================
-- Deletar todos os jobs com payload NULL em status queued
-- Esses jobs estavam bloqueando a fila
DELETE FROM public.jobs
WHERE status = 'queued' 
  AND payload IS NULL;

-- ====================
-- FASE 2: CORRIGIR SHA256 DA v3.10.9
-- ====================
-- A v3.10.9 foi registrada com o script_content da v3.10.8 (bug de copia)
-- Precisamos recalcular o SHA256 correto do script que esta atualmente armazenado
UPDATE public.agent_releases
SET sha256 = encode(digest(script_content, 'sha256'), 'hex')
WHERE version = 'v3.10.9-PSCUSTOMOBJECT-FIX'
  AND platform = 'windows';

-- ====================
-- FASE 3: CRIAR UPDATE_AGENT JOBS
-- ====================
-- Criar update_agent jobs APENAS para testepc2, BMGTESTE, TESTEMIT
-- (excluindo testepc1 que precisa de reinstalacao manual)
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
WHERE a.agent_name IN ('testepc2', 'BMGTESTE', 'TESTEMIT')
  AND a.status = 'active';

-- ====================
-- FASE 4: CRIAR SECURITY JOBS DE TESTE
-- ====================
-- Criar 3 tipos de security jobs para cada um dos 3 agentes
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
WHERE a.agent_name IN ('testepc2', 'BMGTESTE', 'TESTEMIT')
  AND a.status = 'active';
