-- ============================================================
-- Script de Limpeza de Agente (FASE 1)
-- ============================================================
--
-- Use este script para limpar completamente um agente do banco de dados
-- antes de reinstalar. Util para resolver agentes "stuck" em pending.
--
-- IMPORTANTE: Este script remove TODOS os dados relacionados ao agente,
-- incluindo jobs, metricas, logs, etc. Use com cautela!
--
-- COMO USAR:
-- 1. Substitua 'NOME_DO_AGENTE' pelo nome real do agente
-- 2. Execute no SQL Editor do Supabase
-- 3. Limpe tambem a VM (ver comandos PowerShell abaixo)
-- 4. Gere novo instalador e reinstale
--
-- ============================================================

DO $$
DECLARE
  v_agent_id uuid;
  v_tenant_id uuid;
  v_jobs_deleted integer;
  v_tokens_deleted integer;
  v_metrics_deleted integer;
  v_analytics_deleted integer;
  v_keys_deleted integer;
BEGIN
  -- Substitua 'NOME_DO_AGENTE' pelo nome real
  SELECT id, tenant_id INTO v_agent_id, v_tenant_id
  FROM agents
  WHERE agent_name = 'NOME_DO_AGENTE';
  
  IF v_agent_id IS NULL THEN
    RAISE NOTICE '[ERROR]  Agente "NOME_DO_AGENTE" nao encontrado no banco de dados';
    RETURN;
  END IF;
  
  RAISE NOTICE '[SCAN]  Encontrado agente: % (ID: %, Tenant: %)', 'NOME_DO_AGENTE', v_agent_id, v_tenant_id;
  
  -- 1) Limpar tokens
  DELETE FROM agent_tokens WHERE agent_id = v_agent_id;
  GET DIAGNOSTICS v_tokens_deleted = ROW_COUNT;
  RAISE NOTICE '[OK]  Tokens deletados: %', v_tokens_deleted;
  
  -- 2) Limpar jobs
  DELETE FROM jobs WHERE agent_id = v_agent_id;
  GET DIAGNOSTICS v_jobs_deleted = ROW_COUNT;
  RAISE NOTICE '[OK]  Jobs deletados: %', v_jobs_deleted;
  
  -- 3) Limpar metricas de sistema
  DELETE FROM agent_system_metrics WHERE agent_id = v_agent_id;
  GET DIAGNOSTICS v_metrics_deleted = ROW_COUNT;
  RAISE NOTICE '[OK]  Metricas deletadas: %', v_metrics_deleted;
  
  -- 4) Limpar analytics de instalacao
  DELETE FROM installation_analytics WHERE agent_id = v_agent_id;
  GET DIAGNOSTICS v_analytics_deleted = ROW_COUNT;
  RAISE NOTICE '[OK]  Installation analytics deletados: %', v_analytics_deleted;
  
  -- 5) Limpar enrollment keys usadas por este agente
  DELETE FROM enrollment_keys WHERE used_by_agent = 'NOME_DO_AGENTE';
  GET DIAGNOSTICS v_keys_deleted = ROW_COUNT;
  RAISE NOTICE '[OK]  Enrollment keys deletadas: %', v_keys_deleted;
  
  -- 6) Deletar o agente
  DELETE FROM agents WHERE id = v_agent_id;
  RAISE NOTICE '[OK]  Agente "NOME_DO_AGENTE" deletado com sucesso';
  
  -- 7) Criar audit log da operacao
  INSERT INTO audit_logs (
    tenant_id,
    user_id,
    action,
    resource_type,
    resource_id,
    success,
    details
  ) VALUES (
    v_tenant_id,
    NULL, -- Sistema
    'cleanup_agent',
    'agent',
    v_agent_id::text,
    true,
    jsonb_build_object(
      'agent_name', 'NOME_DO_AGENTE',
      'tokens_deleted', v_tokens_deleted,
      'jobs_deleted', v_jobs_deleted,
      'metrics_deleted', v_metrics_deleted,
      'analytics_deleted', v_analytics_deleted,
      'keys_deleted', v_keys_deleted,
      'timestamp', NOW()
    )
  );
  
  RAISE NOTICE '';
  RAISE NOTICE '???????????????????????????????????????????????????????????????';
  RAISE NOTICE '[OK]  LIMPEZA CONCLUIDA - Agente "NOME_DO_AGENTE" removido do banco';
  RAISE NOTICE '???????????????????????????????????????????????????????????????';
  RAISE NOTICE '';
  RAISE NOTICE '? PROXIMOS PASSOS:';
  RAISE NOTICE '1. Limpar VM com PowerShell (ver comandos abaixo)';
  RAISE NOTICE '2. Gerar novo instalador no dashboard (/admin/agent-installer)';
  RAISE NOTICE '3. Executar instalador como Administrador na VM';
  RAISE NOTICE '4. Validar heartbeat aparece em < 2 minutos';
  RAISE NOTICE '';
  
END $$;

-- ============================================================
-- COMANDOS POWERSHELL PARA LIMPAR VM (executar como Admin)
-- ============================================================
--
-- Copie e cole estes comandos no PowerShell da VM:
--
-- # Parar e remover Scheduled Task
-- Stop-ScheduledTask -TaskName "CyberShieldAgent-NOME_DO_AGENTE" -ErrorAction SilentlyContinue
-- Unregister-ScheduledTask -TaskName "CyberShieldAgent-NOME_DO_AGENTE" -Confirm:$false -ErrorAction SilentlyContinue
--
-- # Remover pasta e logs antigos
-- Remove-Item "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue
--
-- # Verificar limpeza
-- Get-ScheduledTask -TaskName "CyberShieldAgent*" -ErrorAction SilentlyContinue
-- Test-Path "C:\CyberShield"
--
-- # Resultado esperado:
-- # - Nenhuma task encontrada
-- # - C:\CyberShield nao existe (False)
--
-- ============================================================

-- ============================================================
-- SCRIPT DE LIMPEZA EM MASSA (TODOS OS AGENTES PENDING)
-- ============================================================
--
-- Use com EXTREMA cautela! Remove TODOS os agentes stuck em pending
-- sem heartbeat por mais de 48 horas.
--
-- Descomente para executar:
--
-- DO $$
-- DECLARE
--   v_agent_record RECORD;
--   v_total_cleaned integer := 0;
-- BEGIN
--   FOR v_agent_record IN 
--     SELECT id, agent_name, enrolled_at
--     FROM agents
--     WHERE status = 'pending'
--       AND last_heartbeat IS NULL
--       AND enrolled_at < NOW() - INTERVAL '48 hours'
--   LOOP
--     -- Deletar relacionados
--     DELETE FROM agent_tokens WHERE agent_id = v_agent_record.id;
--     DELETE FROM jobs WHERE agent_id = v_agent_record.id;
--     DELETE FROM agent_system_metrics WHERE agent_id = v_agent_record.id;
--     DELETE FROM installation_analytics WHERE agent_id = v_agent_record.id;
--     DELETE FROM enrollment_keys WHERE used_by_agent = v_agent_record.agent_name;
--     
--     -- Deletar agente
--     DELETE FROM agents WHERE id = v_agent_record.id;
--     
--     v_total_cleaned := v_total_cleaned + 1;
--     RAISE NOTICE 'Limpo: % (enrolled: %)', v_agent_record.agent_name, v_agent_record.enrolled_at;
--   END LOOP;
--   
--   RAISE NOTICE '[OK]  Total de agentes orfaos limpos: %', v_total_cleaned;
-- END $$;
--
-- ============================================================
