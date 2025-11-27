-- ============================================================================
-- CORRECAO CRITICA: agent_releases v3.10.9 com script_content errado
-- ============================================================================
-- Problema: A entrada v3.10.9-PSCUSTOMOBJECT-FIX foi registrada com script_content
-- copiado da v3.10.8-AGENT-ID-FIX (continha versao antiga do script)
-- Isso causa 503 Service Unavailable no serve-installer com erro:
-- "CRITICAL: Agent script version mismatch"
--
-- Solucao: Deletar entrada incorreta e re-registrar via UI usando o botao
-- "Registrar Versao Atual" que pega o script correto dos arquivos sincronizados
-- ============================================================================

-- Deletar entrada incorreta de v3.10.9
DELETE FROM public.agent_releases 
WHERE version = 'v3.10.9-PSCUSTOMOBJECT-FIX'
  AND platform = 'windows';

-- Nota: Apos esta migration, o usuario deve:
-- 1. Clicar no botao "Registrar Versao Atual" na pagina /admin/agent-releases
-- 2. Esse botao chama register-agent-release Edge Function que pega script correto
-- 3. Gerar nova enrollment key para testepc1 em /admin/agent-installer
-- 4. Executar novo comando de instalacao no testepc1