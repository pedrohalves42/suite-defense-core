
# Plano: 5 Correções Cirurgicas para Bugs Silenciosos

## Resumo Executivo

Este plano implementa **5 correções cirurgicas** derivadas diretamente da auditoria, sem refatoracoes grandes, apenas fechando pontos que geram bugs silenciosos e inconsistencias.

| # | Correcao | Problema | Impacto |
|---|----------|----------|---------|
| 1 | Crons com Validacao de Status | net.http_post retorna 200 mesmo com erro logico | CRITICO |
| 2 | Blindagem Tenant nas RPCs | SECURITY DEFINER pode bypassar RLS | CRITICO |
| 3 | Soft-Delete em job_executions | Delete direto apaga evidencia de auditoria | ALTO |
| 4 | View Canonica v_agent_state | UI mostra estados inconsistentes | ALTO |
| 5 | Rollout v4.5.0 Seguro | Atualiza agentes "mortos" | MEDIO |

---

## Fase 1: Correcao de Schema

### 1.1 Adicionar Coluna archived_at em job_executions

A tabela `job_executions` nao possui `archived_at`. Precisamos adicionar:

```sql
ALTER TABLE job_executions 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_job_executions_archived_at 
ON job_executions(archived_at) WHERE archived_at IS NOT NULL;
```

### 1.2 Atualizar Trigger prevent_execution_deletion

Modificar para usar soft-delete e permitir delete apos 30 dias de arquivamento:

```sql
CREATE OR REPLACE FUNCTION prevent_execution_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Permitir delecao de registros arquivados ha mais de 30 dias
  IF OLD.archived_at IS NOT NULL 
     AND OLD.archived_at < NOW() - INTERVAL '30 days' THEN
    RETURN OLD;
  END IF;
  
  -- Bloquear delecao de registros nao arquivados ou recentes
  RAISE EXCEPTION 'Cannot delete job execution records. Archive first, then wait 30 days.'
    USING ERRCODE = '23514';
END;
$$;
```

---

## Fase 2: Blindagem de Tenant nas RPCs

### 2.1 process_dlq_batch com Validacao

```sql
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
  -- BLINDAGEM DE TENANT
  IF p_tenant_id IS DISTINCT FROM get_active_tenant_id()
     AND NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Tenant mismatch: access denied';
  END IF;

  FOR v_item IN
    SELECT d.id, d.original_job_id, d.retry_count
    FROM failed_jobs_dlq d
    WHERE d.tenant_id = p_tenant_id
      AND d.resolved_at IS NULL
    ORDER BY d.last_failure_at ASC
    LIMIT p_batch_size
  LOOP
    v_processed := v_processed + 1;
    
    IF p_action = 'retry' AND v_item.retry_count < 3 THEN
      UPDATE jobs 
      SET status = 'queued', updated_at = NOW()
      WHERE id = v_item.original_job_id;
      
      UPDATE failed_jobs_dlq 
      SET retry_count = retry_count + 1, next_retry_at = NOW()
      WHERE id = v_item.id;
      
      v_retried := v_retried + 1;
    ELSE
      UPDATE failed_jobs_dlq 
      SET resolved_at = NOW(), 
          resolution_notes = 'Resolved via batch cleanup',
          status = 'resolved'
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

### 2.2 cleanup_stale_tasks com Validacao

```sql
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
BEGIN
  -- BLINDAGEM DE TENANT
  IF p_tenant_id IS DISTINCT FROM get_active_tenant_id()
     AND NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Tenant mismatch: access denied';
  END IF;

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
      closure_reason = 'Auto-cancelled: orphan task without fingerprint'
  FROM orphan_tasks o
  WHERE t.id = o.id;
  
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'cancelled_orphans', v_cancelled,
    'tenant_id', p_tenant_id
  );
END;
$$;
```

---

## Fase 3: View Canonica v_agent_state

Criar view unica fonte de verdade para estado do agente:

```sql
CREATE OR REPLACE VIEW v_agent_state 
WITH (security_invoker = on) AS
SELECT
  a.id AS agent_id,
  a.tenant_id,
  a.hostname,
  a.agent_name,
  a.display_name,
  a.last_heartbeat,
  a.agent_version,
  a.agent_state,
  a.agent_state_reason,
  a.is_isolated,
  a.is_throttled,
  
  -- Estado canonico derivado
  CASE
    WHEN a.archived_at IS NOT NULL THEN 'archived'
    WHEN a.is_isolated THEN 'isolated'
    WHEN a.agent_state = 'safe_mode' THEN 'safe_mode'
    WHEN a.last_heartbeat < NOW() - INTERVAL '30 minutes' THEN 'offline'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'warning'
    ELSE 'healthy'
  END AS canonical_state,
  
  -- Lag do heartbeat
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) AS heartbeat_lag_seconds,
  
  -- Metadata
  NOW() AS snapshot_at
  
FROM agents a
WHERE a.status = 'active'
  AND a.archived_at IS NULL
  AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin());

COMMENT ON VIEW v_agent_state IS 
'ADR: View canonica para estado do agente. Toda UI deve ler estado APENAS desta view.';
```

---

## Fase 4: RPC de Arquivamento de Execucoes

```sql
CREATE OR REPLACE FUNCTION archive_old_executions(
  p_older_than_days INTEGER DEFAULT 90,
  p_batch_size INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_archived INTEGER := 0;
  v_deleted INTEGER := 0;
BEGIN
  -- Apenas super_admin pode executar
  IF NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can archive executions';
  END IF;

  -- Etapa 1: Arquivar execucoes antigas
  UPDATE job_executions
  SET archived_at = NOW()
  WHERE created_at < NOW() - (p_older_than_days || ' days')::INTERVAL
    AND archived_at IS NULL
  LIMIT p_batch_size;
  
  GET DIAGNOSTICS v_archived = ROW_COUNT;
  
  -- Etapa 2: Deletar apenas apos 30 dias arquivado
  DELETE FROM job_executions
  WHERE archived_at < NOW() - INTERVAL '30 days'
  LIMIT p_batch_size;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'archived', v_archived,
    'deleted', v_deleted,
    'older_than_days', p_older_than_days
  );
END;
$$;
```

---

## Fase 5: Crons com Validacao de Status (Pós-Migracao)

Os crons atuais (Jobs 73, 74, 75) usam `net.http_post` que retorna 200 mesmo com erro logico.

**Nota tecnica:** O `net.http_post` do `pg_net` retorna o `request_id`, nao o response body. A validacao de status precisa ser feita via webhook callback ou tabela de resultados.

Correcao alternativa pratica: criar tabela de health check que as Edge Functions atualizam, e um cron separado que valida se os health checks estao atualizados.

```sql
-- Tabela de health check
CREATE TABLE IF NOT EXISTS cron_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL UNIQUE,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO cron_health_checks (cron_name) VALUES 
  ('integrity-sentinel-15min'),
  ('rls-automated-tests-6h'),
  ('evaluate-software-risk-daily')
ON CONFLICT (cron_name) DO NOTHING;

-- View para alertar crons mortos
CREATE OR REPLACE VIEW v_cron_health AS
SELECT 
  cron_name,
  last_success_at,
  consecutive_failures,
  CASE
    WHEN last_success_at IS NULL THEN 'never_run'
    WHEN consecutive_failures >= 3 THEN 'critical'
    WHEN consecutive_failures >= 1 THEN 'warning'
    WHEN last_success_at < NOW() - INTERVAL '2 hours' 
      AND cron_name LIKE '%15min%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '12 hours' 
      AND cron_name LIKE '%6h%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '48 hours' 
      AND cron_name LIKE '%daily%' THEN 'stale'
    ELSE 'healthy'
  END AS status
FROM cron_health_checks;
```

---

## Fase 6: Rollout Seguro v4.5.0

A tabela `agents` nao possui colunas `agent_health` ou `pending_tasks`. Usar campos existentes:

```sql
-- Rollout seguro usando campos existentes
UPDATE agents
SET
  force_update_version = 'v4.5.0',
  force_update_reason = 'Controlled rollout v4.5.0 - safe batch',
  force_update_at = NOW()
WHERE status = 'active'
  AND archived_at IS NULL
  AND (agent_version IS NULL OR agent_version != 'v4.5.0')
  AND last_heartbeat > NOW() - INTERVAL '10 minutes'
  AND agent_state NOT IN ('safe_mode', 'isolated', 'quarantined')
  AND is_isolated IS NOT TRUE
  AND is_throttled IS NOT TRUE;
```

---

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| SQL Migration | Criar migracao consolidada |
| Edge Functions | Adicionar update em `cron_health_checks` apos sucesso |

---

## Checklist de Validacao

```sql
-- 1. Verificar coluna archived_at existe
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'job_executions' AND column_name = 'archived_at';

-- 2. Verificar view v_agent_state existe
SELECT viewname FROM pg_views WHERE viewname = 'v_agent_state';

-- 3. Verificar RPCs tem blindagem
SELECT prosrc FROM pg_proc WHERE proname = 'process_dlq_batch' 
AND prosrc LIKE '%Tenant mismatch%';

-- 4. Verificar tabela cron_health_checks
SELECT * FROM cron_health_checks;

-- 5. Estado canonico dos agentes
SELECT canonical_state, COUNT(*) FROM v_agent_state GROUP BY canonical_state;
```

---

## Secao Tecnica: Migracao SQL Consolidada

```sql
-- ============================================================
-- MIGRACAO: 5 Correcoes Cirurgicas
-- ============================================================

BEGIN;

-- 1. Adicionar archived_at em job_executions
ALTER TABLE job_executions 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_job_executions_archived_at 
ON job_executions(archived_at) WHERE archived_at IS NOT NULL;

-- 2. Atualizar trigger
CREATE OR REPLACE FUNCTION prevent_execution_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL 
     AND OLD.archived_at < NOW() - INTERVAL '30 days' THEN
    RETURN OLD;
  END IF;
  
  RAISE EXCEPTION 'Cannot delete job execution records. Archive first, then wait 30 days.'
    USING ERRCODE = '23514';
END;
$$;

-- 3. RPC process_dlq_batch com blindagem
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
  IF p_tenant_id IS DISTINCT FROM get_active_tenant_id()
     AND NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Tenant mismatch: access denied';
  END IF;

  FOR v_item IN
    SELECT d.id, d.original_job_id, d.retry_count
    FROM failed_jobs_dlq d
    WHERE d.tenant_id = p_tenant_id
      AND d.resolved_at IS NULL
    ORDER BY d.last_failure_at ASC
    LIMIT p_batch_size
  LOOP
    v_processed := v_processed + 1;
    
    IF p_action = 'retry' AND v_item.retry_count < 3 THEN
      UPDATE jobs 
      SET status = 'queued', updated_at = NOW()
      WHERE id = v_item.original_job_id;
      
      UPDATE failed_jobs_dlq 
      SET retry_count = retry_count + 1, next_retry_at = NOW()
      WHERE id = v_item.id;
      
      v_retried := v_retried + 1;
    ELSE
      UPDATE failed_jobs_dlq 
      SET resolved_at = NOW(), 
          resolution_notes = 'Resolved via batch cleanup',
          status = 'resolved'
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

-- 4. RPC cleanup_stale_tasks com blindagem
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
BEGIN
  IF p_tenant_id IS DISTINCT FROM get_active_tenant_id()
     AND NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Tenant mismatch: access denied';
  END IF;

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
      closure_reason = 'Auto-cancelled: orphan task without fingerprint'
  FROM orphan_tasks o
  WHERE t.id = o.id;
  
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'cancelled_orphans', v_cancelled,
    'tenant_id', p_tenant_id
  );
END;
$$;

-- 5. View canonica v_agent_state
CREATE OR REPLACE VIEW v_agent_state 
WITH (security_invoker = on) AS
SELECT
  a.id AS agent_id,
  a.tenant_id,
  a.hostname,
  a.agent_name,
  a.display_name,
  a.last_heartbeat,
  a.agent_version,
  a.agent_state,
  a.agent_state_reason,
  a.is_isolated,
  a.is_throttled,
  CASE
    WHEN a.archived_at IS NOT NULL THEN 'archived'
    WHEN a.is_isolated THEN 'isolated'
    WHEN a.agent_state = 'safe_mode' THEN 'safe_mode'
    WHEN a.last_heartbeat < NOW() - INTERVAL '30 minutes' THEN 'offline'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'warning'
    ELSE 'healthy'
  END AS canonical_state,
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat)) AS heartbeat_lag_seconds,
  NOW() AS snapshot_at
FROM agents a
WHERE a.status = 'active'
  AND a.archived_at IS NULL
  AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin());

COMMENT ON VIEW v_agent_state IS 
'ADR: View canonica para estado do agente. Toda UI deve ler estado APENAS desta view.';

-- 6. Tabela cron_health_checks
CREATE TABLE IF NOT EXISTS cron_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL UNIQUE,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO cron_health_checks (cron_name) VALUES 
  ('integrity-sentinel-15min'),
  ('rls-automated-tests-6h'),
  ('evaluate-software-risk-daily')
ON CONFLICT (cron_name) DO NOTHING;

-- 7. View v_cron_health
CREATE OR REPLACE VIEW v_cron_health AS
SELECT 
  cron_name,
  last_success_at,
  consecutive_failures,
  CASE
    WHEN last_success_at IS NULL THEN 'never_run'
    WHEN consecutive_failures >= 3 THEN 'critical'
    WHEN consecutive_failures >= 1 THEN 'warning'
    WHEN last_success_at < NOW() - INTERVAL '2 hours' 
      AND cron_name LIKE '%15min%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '12 hours' 
      AND cron_name LIKE '%6h%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '48 hours' 
      AND cron_name LIKE '%daily%' THEN 'stale'
    ELSE 'healthy'
  END AS status
FROM cron_health_checks;

-- 8. RPC archive_old_executions
CREATE OR REPLACE FUNCTION archive_old_executions(
  p_older_than_days INTEGER DEFAULT 90,
  p_batch_size INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_archived INTEGER := 0;
  v_deleted INTEGER := 0;
BEGIN
  IF NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can archive executions';
  END IF;

  WITH to_archive AS (
    SELECT id FROM job_executions
    WHERE created_at < NOW() - (p_older_than_days || ' days')::INTERVAL
      AND archived_at IS NULL
    LIMIT p_batch_size
  )
  UPDATE job_executions je
  SET archived_at = NOW()
  FROM to_archive ta
  WHERE je.id = ta.id;
  
  GET DIAGNOSTICS v_archived = ROW_COUNT;
  
  DELETE FROM job_executions
  WHERE archived_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'archived', v_archived,
    'deleted', v_deleted,
    'older_than_days', p_older_than_days
  );
END;
$$;

COMMIT;
```

---

## Pos-Migracao: Rollout v4.5.0

Executar manualmente apos confirmar migracao:

```sql
UPDATE agents
SET
  force_update_version = 'v4.5.0',
  force_update_reason = 'Controlled rollout v4.5.0 - safe batch',
  force_update_at = NOW()
WHERE status = 'active'
  AND archived_at IS NULL
  AND (agent_version IS NULL OR agent_version != 'v4.5.0')
  AND last_heartbeat > NOW() - INTERVAL '10 minutes'
  AND agent_state NOT IN ('safe_mode', 'isolated', 'quarantined')
  AND is_isolated IS NOT TRUE
  AND is_throttled IS NOT TRUE;
```
