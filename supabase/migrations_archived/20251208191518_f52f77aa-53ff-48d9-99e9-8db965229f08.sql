
-- P1 FIX: Corrigir RLS policies permissivas em ai_action_executions e installation_analytics
-- E registrar v3.10.27-SCAN-RETRY-BACKOFF em agent_releases

-- =====================================================
-- 1. CORRIGIR ai_action_executions - INSERT/UPDATE devem ser service_role only
-- =====================================================

-- Remover policies permissivas
DROP POLICY IF EXISTS "System can insert executions" ON public.ai_action_executions;
DROP POLICY IF EXISTS "System can update executions" ON public.ai_action_executions;

-- Criar policies restritas para service_role
CREATE POLICY "Service role can insert executions" 
ON public.ai_action_executions 
FOR INSERT 
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update executions" 
ON public.ai_action_executions 
FOR UPDATE 
TO service_role
USING (true);

-- =====================================================
-- 2. CORRIGIR installation_analytics - INSERT deve validar tenant
-- =====================================================

-- Remover policy permissiva
DROP POLICY IF EXISTS "Agents can insert installation events" ON public.installation_analytics;

-- Criar policy restrita para service_role (Edge Functions usam service_role)
CREATE POLICY "Service role can insert installation events" 
ON public.installation_analytics 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- =====================================================
-- 3. LIMPAR agent_releases e registrar v3.10.27
-- =====================================================

-- Desativar versoes anteriores
UPDATE public.agent_releases 
SET is_active = false 
WHERE platform = 'windows';

UPDATE public.agent_versions 
SET is_latest = false 
WHERE platform = 'windows';

-- Remover entrada com script_content vazio (v3.10.26)
DELETE FROM public.agent_releases 
WHERE version = 'v3.10.26-RATE-LIMIT-BACKOFF' 
  AND (script_content IS NULL OR script_content = '' OR LENGTH(script_content) < 1000);

-- Remover versoes antigas (manter apenas ultimas 3)
DELETE FROM public.agent_releases 
WHERE platform = 'windows' 
  AND version NOT IN (
    SELECT version FROM public.agent_releases 
    WHERE platform = 'windows' 
    ORDER BY created_at DESC 
    LIMIT 3
  );
