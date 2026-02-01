
# Plano Completo: Fechamento de Ciclos e GAPs do Sistema

## Resumo Executivo

Este plano aborda **6 ciclos críticos abertos** identificados na auditoria do sistema:

| # | GAP | Impacto | Prioridade |
|---|-----|---------|------------|
| 1 | Crons falhando (125+ falhas/24h) | Sistema de monitoramento inoperante | CRÍTICO |
| 2 | RLS desabilitado em partições | Vazamento de dados cross-tenant | CRÍTICO |
| 3 | Cleanup bloqueado por trigger | Crescimento descontrolado do banco | ALTO |
| 4 | Cron evaluate-software-risk com coluna errada | Avaliação de risco não funciona | MÉDIO |
| 5 | DLQ com 251 items pendentes | Falhas não processadas | MÉDIO |
| 6 | 6.651 tasks abertas acumuladas | Backlog operacional | MÉDIO |

---

## Fase 1: Correção dos Crons Críticos

### 1.1 Corrigir JSON Escaping nos Crons

**Problema:** Os crons `integrity-sentinel-15min` e `rls-automated-tests-6h` falham porque o JSON está malformado.

**Solução SQL:**
```sql
-- ============================================================
-- CORREÇÃO: Crons com JSON malformado
-- ============================================================

-- Corrigir integrity-sentinel-15min (Job 67)
SELECT cron.unschedule('integrity-sentinel-15min');

SELECT cron.schedule(
  'integrity-sentinel-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/integrity-sentinel',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ***REMOVED***'
    ),
    body := jsonb_build_object('source', 'cron')
  ) AS request_id;
  $$
);

-- Corrigir rls-automated-tests-6h (Job 66)
SELECT cron.unschedule('rls-automated-tests-6h');

SELECT cron.schedule(
  'rls-automated-tests-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/run-rls-tests',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ***REMOVED***'
    ),
    body := jsonb_build_object('source', 'cron', 'run_type', 'scheduled')
  ) AS request_id;
  $$
);
```

### 1.2 Corrigir Trigger que Bloqueia Cleanup

**Problema:** O trigger `prevent_execution_deletion()` bloqueia a limpeza de dados antigos.

**Solução:** Modificar o trigger para permitir deleção de registros > 90 dias.

```sql
-- ============================================================
-- CORREÇÃO: Trigger prevent_execution_deletion
-- Permite deleção de registros antigos (> 90 dias)
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_execution_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Permitir deleção de registros antigos (> 90 dias) para cleanup
  IF OLD.created_at < NOW() - INTERVAL '90 days' THEN
    RETURN OLD;
  END IF;
  
  -- Bloquear deleção de registros recentes
  RAISE EXCEPTION 'Cannot delete job execution records within 90 days retention period'
    USING ERRCODE = '23514';
END;
$$;

-- Recriar trigger
DROP TRIGGER IF EXISTS tr_prevent_execution_deletion ON job_executions;

CREATE TRIGGER tr_prevent_execution_deletion
  BEFORE DELETE ON job_executions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_execution_deletion();
```

### 1.3 Corrigir Coluna no evaluate-software-risk

**Problema:** O cron referencia `last_heartbeat_at` mas a coluna real é `last_heartbeat`.

```sql
-- ============================================================
-- CORREÇÃO: Cron evaluate-software-risk-daily (Job 72)
-- ============================================================

SELECT cron.unschedule('evaluate-software-risk-daily');

SELECT cron.schedule(
  'evaluate-software-risk-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/evaluate-software-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ***REMOVED***'
    ),
    body := jsonb_build_object('source', 'cron')
  ) AS request_id;
  $$
);
```

---

## Fase 2: Habilitar RLS nas Partições

### 2.1 Partições de agent_system_metrics

```sql
-- ============================================================
-- RLS: Partições de agent_system_metrics
-- ============================================================

-- Habilitar RLS na partição 2026_03
ALTER TABLE agent_system_metrics_2026_03 ENABLE ROW LEVEL SECURITY;

-- Criar policy de isolamento multi-tenant
CREATE POLICY "tenant_isolation_select" ON agent_system_metrics_2026_03
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_active_tenant_id() 
    OR is_current_super_admin()
  );

CREATE POLICY "tenant_isolation_insert" ON agent_system_metrics_2026_03
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_active_tenant_id()
  );

-- Policy para service_role (Edge Functions)
CREATE POLICY "service_role_all" ON agent_system_metrics_2026_03
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
```

### 2.2 Partições de hmac_signatures

```sql
-- ============================================================
-- RLS: Partições de hmac_signatures (Fev-Jun 2026)
-- ============================================================

DO $$
DECLARE
  partition_name TEXT;
  partitions TEXT[] := ARRAY[
    'hmac_signatures_2026_02',
    'hmac_signatures_2026_03',
    'hmac_signatures_2026_04',
    'hmac_signatures_2026_05',
    'hmac_signatures_2026_06'
  ];
BEGIN
  FOREACH partition_name IN ARRAY partitions
  LOOP
    -- Habilitar RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
    
    -- Drop policies existentes (se houver)
    EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON %I', partition_name);
    
    -- Criar policy para service_role (única que precisa acessar)
    EXECUTE format(
      'CREATE POLICY "service_role_all" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      partition_name
    );
    
    RAISE NOTICE 'RLS habilitado em: %', partition_name;
  END LOOP;
END $$;
```

---

## Fase 3: Limpeza de DLQ e Tasks

### 3.1 RPC para Processar DLQ em Batch

```sql
-- ============================================================
-- RPC: Processar DLQ em lote
-- ============================================================

CREATE OR REPLACE FUNCTION process_dlq_batch(
  p_tenant_id UUID,
  p_batch_size INTEGER DEFAULT 50,
  p_action TEXT DEFAULT 'resolve' -- 'resolve' ou 'retry'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_retried INTEGER := 0;
  v_resolved INTEGER := 0;
  v_item RECORD;
BEGIN
  -- Processar itens da DLQ
  FOR v_item IN
    SELECT d.id, d.job_id, d.retry_count, j.job_type
    FROM failed_jobs_dlq d
    JOIN jobs j ON j.id = d.job_id
    WHERE j.tenant_id = p_tenant_id
      AND d.resolved_at IS NULL
    ORDER BY d.failed_at ASC
    LIMIT p_batch_size
  LOOP
    v_processed := v_processed + 1;
    
    IF p_action = 'retry' AND v_item.retry_count < 3 THEN
      -- Re-enfileirar o job
      UPDATE jobs 
      SET status = 'queued', 
          updated_at = NOW()
      WHERE id = v_item.job_id;
      
      -- Incrementar retry count
      UPDATE failed_jobs_dlq 
      SET retry_count = retry_count + 1,
          last_retry_at = NOW()
      WHERE id = v_item.id;
      
      v_retried := v_retried + 1;
    ELSE
      -- Marcar como resolvido (sem retry)
      UPDATE failed_jobs_dlq 
      SET resolved_at = NOW(),
          resolution_notes = 'Resolved via batch cleanup'
      WHERE id = v_item.id;
      
      v_resolved := v_resolved + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'processed', v_processed,
    'retried', v_retried,
    'resolved', v_resolved,
    'tenant_id', p_tenant_id
  );
END;
$$;
```

### 3.2 RPC para Limpar Tasks Órfãs

```sql
-- ============================================================
-- RPC: Limpar tasks abertas antigas
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_stale_tasks(
  p_tenant_id UUID,
  p_days_old INTEGER DEFAULT 30,
  p_batch_size INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_cancelled INTEGER := 0;
  v_archived INTEGER := 0;
BEGIN
  -- Cancelar tasks abertas sem fingerprint (órfãs)
  WITH orphan_tasks AS (
    SELECT id FROM tasks
    WHERE tenant_id = p_tenant_id
      AND status = 'open'
      AND fingerprint_id IS NULL
      AND created_at < NOW() - (p_days_old || ' days')::INTERVAL
    LIMIT p_batch_size
  )
  UPDATE tasks t
  SET status = 'cancelled',
      closed_at = NOW(),
      resolution_notes = 'Auto-cancelled: orphan task without fingerprint'
  FROM orphan_tasks o
  WHERE t.id = o.id;
  
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  
  -- Arquivar tasks antigas já resolvidas (> 90 dias)
  WITH old_resolved AS (
    SELECT id FROM tasks
    WHERE tenant_id = p_tenant_id
      AND status IN ('resolved', 'cancelled', 'wont_fix')
      AND closed_at < NOW() - INTERVAL '90 days'
      AND archived_at IS NULL
    LIMIT p_batch_size
  )
  UPDATE tasks t
  SET archived_at = NOW()
  FROM old_resolved o
  WHERE t.id = o.id;
  
  GET DIAGNOSTICS v_archived = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'cancelled_orphans', v_cancelled,
    'archived_old', v_archived,
    'tenant_id', p_tenant_id
  );
END;
$$;
```

---

## Fase 4: Correção do Rollout v4.5.0

### 4.1 Diagnóstico e Força de Atualização

```sql
-- ============================================================
-- Forçar atualização para v4.5.0 nos agentes ativos
-- ============================================================

-- Verificar agentes que precisam atualizar
SELECT 
  id,
  hostname,
  agent_version,
  last_heartbeat,
  CASE 
    WHEN last_heartbeat > NOW() - INTERVAL '10 minutes' THEN 'online'
    WHEN last_heartbeat > NOW() - INTERVAL '1 hour' THEN 'recent'
    ELSE 'offline'
  END as connectivity_status
FROM agents
WHERE status = 'active'
  AND (agent_version IS NULL OR agent_version != 'v4.5.0')
ORDER BY last_heartbeat DESC;

-- Forçar atualização nos agentes online
UPDATE agents
SET 
  force_update_version = 'v4.5.0',
  force_update_reason = 'Scheduled rollout v4.5.0 - batch update',
  force_update_at = NOW()
WHERE status = 'active'
  AND (agent_version IS NULL OR agent_version != 'v4.5.0')
  AND last_heartbeat > NOW() - INTERVAL '10 minutes';
```

---

## Fase 5: Migração SQL Consolidada

### Arquivo: `supabase/migrations/20260201_close_all_gaps.sql`

```sql
-- ============================================================
-- MIGRAÇÃO CONSOLIDADA: Fechamento de Todos os GAPs
-- Data: 2026-02-01
-- Autor: Sistema
-- ============================================================

BEGIN;

-- ============================================================
-- PARTE 1: Corrigir Trigger de Proteção de Execuções
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_execution_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Permitir deleção de registros antigos (> 90 dias) para cleanup
  IF OLD.created_at < NOW() - INTERVAL '90 days' THEN
    RETURN OLD;
  END IF;
  
  -- Bloquear deleção de registros recentes
  RAISE EXCEPTION 'Cannot delete job execution records within 90 days retention period'
    USING ERRCODE = '23514';
END;
$$;

-- ============================================================
-- PARTE 2: Habilitar RLS nas Partições
-- ============================================================

-- agent_system_metrics_2026_03
ALTER TABLE IF EXISTS agent_system_metrics_2026_03 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_select" ON agent_system_metrics_2026_03;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON agent_system_metrics_2026_03;
DROP POLICY IF EXISTS "service_role_all" ON agent_system_metrics_2026_03;

CREATE POLICY "tenant_isolation_select" ON agent_system_metrics_2026_03
  FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY "tenant_isolation_insert" ON agent_system_metrics_2026_03
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_active_tenant_id());

CREATE POLICY "service_role_all" ON agent_system_metrics_2026_03
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- hmac_signatures partitions
DO $$
DECLARE
  partition_name TEXT;
  partitions TEXT[] := ARRAY[
    'hmac_signatures_2026_02',
    'hmac_signatures_2026_03',
    'hmac_signatures_2026_04',
    'hmac_signatures_2026_05',
    'hmac_signatures_2026_06'
  ];
BEGIN
  FOREACH partition_name IN ARRAY partitions
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
      EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON %I', partition_name);
      EXECUTE format(
        'CREATE POLICY "service_role_all" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        partition_name
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Partição % não existe, pulando...', partition_name;
    END;
  END LOOP;
END $$;

-- ============================================================
-- PARTE 3: RPCs de Limpeza
-- ============================================================

-- RPC: Processar DLQ em lote
CREATE OR REPLACE FUNCTION process_dlq_batch(
  p_tenant_id UUID,
  p_batch_size INTEGER DEFAULT 50,
  p_action TEXT DEFAULT 'resolve'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_retried INTEGER := 0;
  v_resolved INTEGER := 0;
  v_item RECORD;
BEGIN
  FOR v_item IN
    SELECT d.id, d.job_id, d.retry_count
    FROM failed_jobs_dlq d
    JOIN jobs j ON j.id = d.job_id
    WHERE j.tenant_id = p_tenant_id
      AND d.resolved_at IS NULL
    ORDER BY d.failed_at ASC
    LIMIT p_batch_size
  LOOP
    v_processed := v_processed + 1;
    
    IF p_action = 'retry' AND v_item.retry_count < 3 THEN
      UPDATE jobs 
      SET status = 'queued', updated_at = NOW()
      WHERE id = v_item.job_id;
      
      UPDATE failed_jobs_dlq 
      SET retry_count = retry_count + 1, last_retry_at = NOW()
      WHERE id = v_item.id;
      
      v_retried := v_retried + 1;
    ELSE
      UPDATE failed_jobs_dlq 
      SET resolved_at = NOW(), resolution_notes = 'Resolved via batch cleanup'
      WHERE id = v_item.id;
      
      v_resolved := v_resolved + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'processed', v_processed,
    'retried', v_retried,
    'resolved', v_resolved,
    'tenant_id', p_tenant_id
  );
END;
$$;

-- RPC: Limpar tasks órfãs
CREATE OR REPLACE FUNCTION cleanup_stale_tasks(
  p_tenant_id UUID,
  p_days_old INTEGER DEFAULT 30,
  p_batch_size INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_cancelled INTEGER := 0;
  v_archived INTEGER := 0;
BEGIN
  WITH orphan_tasks AS (
    SELECT id FROM tasks
    WHERE tenant_id = p_tenant_id
      AND status = 'open'
      AND fingerprint_id IS NULL
      AND created_at < NOW() - (p_days_old || ' days')::INTERVAL
    LIMIT p_batch_size
  )
  UPDATE tasks t
  SET status = 'cancelled',
      closed_at = NOW(),
      resolution_notes = 'Auto-cancelled: orphan task without fingerprint'
  FROM orphan_tasks o
  WHERE t.id = o.id;
  
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  
  WITH old_resolved AS (
    SELECT id FROM tasks
    WHERE tenant_id = p_tenant_id
      AND status IN ('resolved', 'cancelled', 'wont_fix')
      AND closed_at < NOW() - INTERVAL '90 days'
      AND archived_at IS NULL
    LIMIT p_batch_size
  )
  UPDATE tasks t
  SET archived_at = NOW()
  FROM old_resolved o
  WHERE t.id = o.id;
  
  GET DIAGNOSTICS v_archived = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'cancelled_orphans', v_cancelled,
    'archived_old', v_archived,
    'tenant_id', p_tenant_id
  );
END;
$$;

-- ============================================================
-- PARTE 4: Criar Partição Futura de Métricas (Prevenção)
-- ============================================================

-- Criar partição para Abril 2026 se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'agent_system_metrics_2026_04'
  ) THEN
    CREATE TABLE agent_system_metrics_2026_04 
    PARTITION OF agent_system_metrics
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
    
    ALTER TABLE agent_system_metrics_2026_04 ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "tenant_isolation_select" ON agent_system_metrics_2026_04
      FOR SELECT TO authenticated
      USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());
    
    CREATE POLICY "service_role_all" ON agent_system_metrics_2026_04
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Criar partição HMAC para Julho 2026 se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'hmac_signatures_2026_07'
  ) THEN
    CREATE TABLE hmac_signatures_2026_07 
    PARTITION OF hmac_signatures
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
    
    ALTER TABLE hmac_signatures_2026_07 ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "service_role_all" ON hmac_signatures_2026_07
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- ============================================================
-- PARTE 5: Verificação Final (Fora da Transação)
-- ============================================================

DO $$
DECLARE
  v_tables_without_rls INTEGER;
  v_result RECORD;
BEGIN
  -- Verificar se todas as partições têm RLS
  SELECT COUNT(*) INTO v_tables_without_rls
  FROM pg_tables t
  LEFT JOIN pg_class c ON c.relname = t.tablename
  WHERE t.schemaname = 'public'
    AND (t.tablename LIKE 'agent_system_metrics_2026%' 
         OR t.tablename LIKE 'hmac_signatures_2026%')
    AND c.relrowsecurity = false;
  
  IF v_tables_without_rls > 0 THEN
    RAISE WARNING 'ALERTA: % partições ainda sem RLS!', v_tables_without_rls;
  ELSE
    RAISE NOTICE 'OK: Todas as partições têm RLS habilitado';
  END IF;
  
  -- Verificar funções criadas
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_dlq_batch') THEN
    RAISE NOTICE 'OK: RPC process_dlq_batch criada';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_stale_tasks') THEN
    RAISE NOTICE 'OK: RPC cleanup_stale_tasks criada';
  END IF;
END $$;
```

---

## Fase 6: Scripts de Execução Pós-Migração

### 6.1 Corrigir Crons (Executar via SQL Editor)

```sql
-- EXECUTAR MANUALMENTE APÓS MIGRAÇÃO
-- Requer permissões de cron.schedule

-- Corrigir integrity-sentinel-15min
SELECT cron.unschedule('integrity-sentinel-15min');
SELECT cron.schedule(
  'integrity-sentinel-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/integrity-sentinel',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ***REMOVED***'
    ),
    body := jsonb_build_object('source', 'cron')
  ) AS request_id;
  $$
);

-- Corrigir rls-automated-tests-6h
SELECT cron.unschedule('rls-automated-tests-6h');
SELECT cron.schedule(
  'rls-automated-tests-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/run-rls-tests',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ***REMOVED***'
    ),
    body := jsonb_build_object('source', 'cron', 'run_type', 'scheduled')
  ) AS request_id;
  $$
);

-- Corrigir evaluate-software-risk-daily
SELECT cron.unschedule('evaluate-software-risk-daily');
SELECT cron.schedule(
  'evaluate-software-risk-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/evaluate-software-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ***REMOVED***'
    ),
    body := jsonb_build_object('source', 'cron')
  ) AS request_id;
  $$
);

-- Verificar crons corrigidos
SELECT jobid, jobname, schedule, active 
FROM cron.job 
WHERE jobname IN (
  'integrity-sentinel-15min', 
  'rls-automated-tests-6h', 
  'evaluate-software-risk-daily'
);
```

### 6.2 Executar Limpeza de DLQ e Tasks

```sql
-- Obter tenant_id principal
SELECT id, name FROM tenants LIMIT 5;

-- Executar limpeza de DLQ (substituir pelo tenant_id real)
SELECT process_dlq_batch(
  p_tenant_id := 'SEU_TENANT_ID_AQUI'::UUID,
  p_batch_size := 100,
  p_action := 'resolve'
);

-- Executar limpeza de tasks órfãs
SELECT cleanup_stale_tasks(
  p_tenant_id := 'SEU_TENANT_ID_AQUI'::UUID,
  p_days_old := 30,
  p_batch_size := 500
);
```

### 6.3 Forçar Rollout v4.5.0

```sql
-- Forçar atualização em agentes online
UPDATE agents
SET 
  force_update_version = 'v4.5.0',
  force_update_reason = 'Scheduled rollout v4.5.0',
  force_update_at = NOW()
WHERE status = 'active'
  AND (agent_version IS NULL OR agent_version != 'v4.5.0')
  AND last_heartbeat > NOW() - INTERVAL '10 minutes';

-- Verificar resultado
SELECT 
  agent_version,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE last_heartbeat > NOW() - INTERVAL '10 minutes') as online
FROM agents
WHERE status = 'active'
GROUP BY agent_version;
```

---

## Checklist de Validação

| # | Verificação | Query |
|---|-------------|-------|
| 1 | Crons sem falhas | `SELECT * FROM cron.job_run_details WHERE status = 'failed' AND start_time > NOW() - INTERVAL '1 hour'` |
| 2 | Partições com RLS | `SELECT tablename FROM pg_tables t JOIN pg_class c ON c.relname = t.tablename WHERE t.schemaname = 'public' AND tablename LIKE '%2026%' AND c.relrowsecurity = false` |
| 3 | DLQ vazia | `SELECT COUNT(*) FROM failed_jobs_dlq WHERE resolved_at IS NULL` |
| 4 | Tasks órfãs zeradas | `SELECT COUNT(*) FROM tasks WHERE status = 'open' AND fingerprint_id IS NULL AND created_at < NOW() - INTERVAL '30 days'` |
| 5 | Agentes em v4.5.0 | `SELECT agent_version, COUNT(*) FROM agents WHERE status = 'active' GROUP BY agent_version` |

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/migrations/20260201_close_all_gaps.sql` | CRIAR | Migração consolidada |
| Edge Functions | NENHUMA | Não há alteração de código necessária |

---

## Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Crons ainda falhando após correção | Baixa | Testar manualmente antes de agendar |
| Partições não existirem | Média | Script usa IF EXISTS / IF NOT EXISTS |
| DLQ com items críticos | Baixa | Usar `p_action = 'resolve'` conservador |
| Agentes não atualizarem | Média | Verificar conectividade antes de forçar |

