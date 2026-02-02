

# Plano: Correção dos 3 Problemas Críticos Restantes

## Resumo Executivo

Este plano corrige **3 problemas críticos** que estão causando falhas contínuas no sistema:

| # | Problema | Solução | Complexidade |
|---|----------|---------|--------------|
| 1 | cleanup-old-data falha 24x/dia | Atualizar função para arquivar antes de deletar | ALTA |
| 2 | RLS tests com falso positivo | Criar RPC para verificar políticas via service_role | MÉDIA |
| 3 | DLQ com 134 itens | Resolver via batch (já temos a RPC) | BAIXA |

---

## Fase 1: Corrigir cleanup_old_data_scheduled

### Problema
A função tenta deletar `jobs` diretamente, mas a FK com `ON DELETE CASCADE` dispara delete em `job_executions`, e o trigger bloqueia.

### Solução
Reescrever a função para:
1. Primeiro arquivar `job_executions` dos jobs a serem deletados
2. Depois deletar apenas jobs cujas execuções já foram arquivadas há 30+ dias

```sql
CREATE OR REPLACE FUNCTION cleanup_old_data_scheduled()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_hmac_deleted INTEGER := 0;
  v_rate_limits_deleted INTEGER := 0;
  v_failed_logins_deleted INTEGER := 0;
  v_efm_deleted INTEGER := 0;
  v_executions_archived INTEGER := 0;
  v_old_jobs_deleted INTEGER := 0;
BEGIN
  -- Limpar HMAC signatures antigas (>6 horas)
  DELETE FROM public.hmac_signatures WHERE used_at < now() - interval '6 hours';
  GET DIAGNOSTICS v_hmac_deleted = ROW_COUNT;
  
  -- Limpar rate limits antigos (>30 minutos)
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '30 minutes';
  GET DIAGNOSTICS v_rate_limits_deleted = ROW_COUNT;
  
  -- Limpar failed login attempts antigos (>24 horas)
  DELETE FROM public.failed_login_attempts WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_failed_logins_deleted = ROW_COUNT;
  
  -- Limpar edge function metrics antigas (>7 dias)
  DELETE FROM public.edge_function_metrics WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_efm_deleted = ROW_COUNT;
  
  -- ETAPA 1: Arquivar job_executions de jobs antigos (>30 dias)
  WITH old_jobs AS (
    SELECT id FROM public.jobs
    WHERE status IN ('completed', 'failed')
      AND created_at < now() - interval '30 days'
    LIMIT 1000
  ),
  executions_to_archive AS (
    SELECT je.id FROM job_executions je
    INNER JOIN old_jobs oj ON je.job_id = oj.id
    WHERE je.archived_at IS NULL
    LIMIT 1000
  )
  UPDATE job_executions
  SET archived_at = NOW()
  FROM executions_to_archive eta
  WHERE job_executions.id = eta.id;
  
  GET DIAGNOSTICS v_executions_archived = ROW_COUNT;
  
  -- ETAPA 2: Deletar jobs apenas se TODAS as execuções já foram arquivadas há 30+ dias
  WITH deletable_jobs AS (
    SELECT j.id 
    FROM public.jobs j
    WHERE j.status IN ('completed', 'failed')
      AND j.created_at < now() - interval '30 days'
      AND NOT EXISTS (
        -- Não deletar se houver execuções não arquivadas
        SELECT 1 FROM job_executions je 
        WHERE je.job_id = j.id AND je.archived_at IS NULL
      )
      AND NOT EXISTS (
        -- Não deletar se houver execuções arquivadas recentemente (< 30 dias)
        SELECT 1 FROM job_executions je 
        WHERE je.job_id = j.id AND je.archived_at > NOW() - INTERVAL '30 days'
      )
    LIMIT 500
  )
  DELETE FROM public.jobs
  USING deletable_jobs dj
  WHERE jobs.id = dj.id;
  
  GET DIAGNOSTICS v_old_jobs_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'hmac_deleted', v_hmac_deleted,
    'rate_limits_deleted', v_rate_limits_deleted,
    'failed_logins_deleted', v_failed_logins_deleted,
    'edge_function_metrics_deleted', v_efm_deleted,
    'job_executions_archived', v_executions_archived,
    'old_jobs_deleted', v_old_jobs_deleted,
    'executed_at', now()
  );
END;
$$;
```

---

## Fase 2: Corrigir run-rls-tests (Falso Positivo)

### Problema
O teste consulta `pg_policies` via Supabase client, mas essa tabela do sistema não é acessível.

### Solução
Criar uma RPC que verifica políticas usando `service_role`:

```sql
CREATE OR REPLACE FUNCTION count_policies_for_table(p_table_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = p_table_name;
  
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION count_policies_for_table IS 
'Retorna o número de políticas RLS para uma tabela. Usado por run-rls-tests.';
```

### Atualizar Edge Function

Modificar `run-rls-tests/index.ts` para usar a nova RPC:

```typescript
// ANTES (não funciona):
const { count, error } = await supabase
  .from('pg_policies')
  .select('*', { count: 'exact', head: true })
  .eq('tablename', table);

// DEPOIS (funciona):
const { data: policyCount, error } = await supabase
  .rpc('count_policies_for_table', { p_table_name: table });
```

---

## Fase 3: Resolver DLQ Pendente

### Problema
134 itens na DLQ sem resolução.

### Solução
Executar a RPC `process_dlq_batch` para cada tenant com itens pendentes:

```sql
-- Identificar tenants com DLQ pendente
SELECT tenant_id, COUNT(*) as pending
FROM failed_jobs_dlq
WHERE resolved_at IS NULL
GROUP BY tenant_id;

-- Executar resolução em batch
SELECT process_dlq_batch(
  p_tenant_id := 'TENANT_ID'::UUID,
  p_batch_size := 200,
  p_action := 'resolve'
);
```

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| SQL Migration | CRIAR | Corrigir `cleanup_old_data_scheduled` + criar RPC `count_policies_for_table` |
| `run-rls-tests/index.ts` | EDITAR | Usar RPC em vez de consulta direta |

---

## Checklist de Validação

```sql
-- 1. Verificar cleanup não falha mais
SELECT status, COUNT(*) 
FROM cron.job_run_details 
WHERE jobid = 34 AND start_time > NOW() - INTERVAL '2 hours'
GROUP BY status;

-- 2. Verificar RLS tests passam
SELECT * FROM v_cron_health WHERE cron_name = 'rls-automated-tests-6h';

-- 3. Verificar DLQ zerada
SELECT COUNT(*) FROM failed_jobs_dlq WHERE resolved_at IS NULL;
```

---

## Seção Técnica: SQL Consolidado

```sql
-- ============================================================
-- MIGRAÇÃO: Correção dos 3 Problemas Críticos Restantes
-- ============================================================

BEGIN;

-- 1. Corrigir cleanup_old_data_scheduled
CREATE OR REPLACE FUNCTION cleanup_old_data_scheduled()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_hmac_deleted INTEGER := 0;
  v_rate_limits_deleted INTEGER := 0;
  v_failed_logins_deleted INTEGER := 0;
  v_efm_deleted INTEGER := 0;
  v_executions_archived INTEGER := 0;
  v_old_jobs_deleted INTEGER := 0;
BEGIN
  DELETE FROM public.hmac_signatures WHERE used_at < now() - interval '6 hours';
  GET DIAGNOSTICS v_hmac_deleted = ROW_COUNT;
  
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '30 minutes';
  GET DIAGNOSTICS v_rate_limits_deleted = ROW_COUNT;
  
  DELETE FROM public.failed_login_attempts WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_failed_logins_deleted = ROW_COUNT;
  
  DELETE FROM public.edge_function_metrics WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_efm_deleted = ROW_COUNT;
  
  -- ETAPA 1: Arquivar job_executions de jobs antigos
  WITH old_jobs AS (
    SELECT id FROM public.jobs
    WHERE status IN ('completed', 'failed')
      AND created_at < now() - interval '30 days'
    LIMIT 1000
  ),
  executions_to_archive AS (
    SELECT je.id FROM job_executions je
    INNER JOIN old_jobs oj ON je.job_id = oj.id
    WHERE je.archived_at IS NULL
    LIMIT 1000
  )
  UPDATE job_executions
  SET archived_at = NOW()
  FROM executions_to_archive eta
  WHERE job_executions.id = eta.id;
  
  GET DIAGNOSTICS v_executions_archived = ROW_COUNT;
  
  -- ETAPA 2: Deletar jobs cujas execuções já foram arquivadas há 30+ dias
  WITH deletable_jobs AS (
    SELECT j.id 
    FROM public.jobs j
    WHERE j.status IN ('completed', 'failed')
      AND j.created_at < now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM job_executions je 
        WHERE je.job_id = j.id AND je.archived_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM job_executions je 
        WHERE je.job_id = j.id AND je.archived_at > NOW() - INTERVAL '30 days'
      )
    LIMIT 500
  )
  DELETE FROM public.jobs
  USING deletable_jobs dj
  WHERE jobs.id = dj.id;
  
  GET DIAGNOSTICS v_old_jobs_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'hmac_deleted', v_hmac_deleted,
    'rate_limits_deleted', v_rate_limits_deleted,
    'failed_logins_deleted', v_failed_logins_deleted,
    'edge_function_metrics_deleted', v_efm_deleted,
    'job_executions_archived', v_executions_archived,
    'old_jobs_deleted', v_old_jobs_deleted,
    'executed_at', now()
  );
END;
$$;

-- 2. Criar RPC para verificar políticas
CREATE OR REPLACE FUNCTION count_policies_for_table(p_table_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = p_table_name;
  
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION count_policies_for_table IS 
'Retorna número de políticas RLS para uma tabela. Usado por run-rls-tests.';

-- 3. Atualizar cron_health_checks para resetar falhas
UPDATE cron_health_checks
SET consecutive_failures = 0,
    last_error = NULL,
    updated_at = NOW()
WHERE cron_name = 'rls-automated-tests-6h';

COMMIT;
```

---

## Ordem de Execução

1. Executar migração SQL
2. Editar `run-rls-tests/index.ts` para usar nova RPC
3. Deploy da Edge Function
4. Executar resolução de DLQ
5. Monitorar próximo ciclo de crons

