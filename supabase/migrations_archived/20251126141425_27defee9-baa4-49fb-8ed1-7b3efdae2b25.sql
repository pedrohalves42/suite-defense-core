-- ============================================================================
-- FASE 2: Deletar entrada incorreta v3.10.9-PSCUSTOMOBJECT-FIX
-- ============================================================================
-- Problema: v3.10.9 foi registrada com script_content da v3.10.8
-- Causa: get-agent-script-content nao tinha sido redeployado
-- Solucao: Deletar entrada incorreta para permitir re-registro correto
-- ============================================================================

DELETE FROM public.agent_releases 
WHERE version = 'v3.10.9-PSCUSTOMOBJECT-FIX'
  AND platform = 'windows';

-- Nota: Apos esta migration:
-- 1. Edge Function get-agent-script-content sera redeployado automaticamente
-- 2. Usuario clicara em "Forcar Re-registro" na UI
-- 3. Nova entrada v3.10.9 sera criada com script_content correto
-- 4. serve-installer retornara 200 OK (nao mais 503)