

# Plano: Correções Cirúrgicas Finais (6 Erros Críticos)

## Resumo Executivo

Este plano implementa **6 correções cirúrgicas obrigatórias** identificadas na auditoria de qualidade:

| # | Erro | Impacto | Status |
|---|------|---------|--------|
| 1 | LIMIT em DELETE (PostgreSQL inválido) | Migração falha | CRÍTICO |
| 2 | Trigger não recriado na tabela | Proteção de auditoria ausente | CRÍTICO |
| 3 | View sem security_invoker | Bypass de RLS possível | ALTO |
| 4 | Edge Functions não chamam health check | Cron monitoring morto | ALTO |
| 5 | Colunas verificadas | OK | OK |
| 6 | Rollout pode pegar zumbi | Risco residual | DOCUMENTAR |

---

## Fase 1: Correção de Schema (Migração SQL)

### 1.1 Corrigir DELETE com CTE em archive_old_executions

A função atual usa DELETE...WHERE sem CTE para o LIMIT:

```sql
-- ERRO ATUAL:
DELETE FROM job_executions
WHERE archived_at < NOW() - INTERVAL '30 days';
-- Sem LIMIT! Pode deletar milhões de linhas de uma vez
```

**Correção:**

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
  IF NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can archive executions';
  END IF;

  -- Etapa 1: Arquivar execuções antigas (CTE correto)
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
  
  -- Etapa 2: Deletar com CTE (CORREÇÃO CRÍTICA)
  WITH to_delete AS (
    SELECT id FROM job_executions
    WHERE archived_at < NOW() - INTERVAL '30 days'
    LIMIT p_batch_size
  )
  DELETE FROM job_executions je
  USING to_delete td
  WHERE je.id = td.id;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'archived', v_archived,
    'deleted', v_deleted,
    'older_than_days', p_older_than_days
  );
END;
$$;
```

### 1.2 Criar Trigger na Tabela (CRÍTICO)

O trigger `tr_prevent_execution_deletion` **não existe**. A função está definida mas não aplicada:

```sql
-- Garantir que o trigger existe
DROP TRIGGER IF EXISTS tr_prevent_execution_deletion ON job_executions;

CREATE TRIGGER tr_prevent_execution_deletion
  BEFORE DELETE ON job_executions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_execution_deletion();

COMMENT ON TRIGGER tr_prevent_execution_deletion ON job_executions IS 
'ADR: Proteção de imutabilidade. Permite delete apenas de registros arquivados há 30+ dias.';
```

### 1.3 Recriar View com security_invoker

A view atual foi criada **sem** `security_invoker = on`:

```sql
DROP VIEW IF EXISTS v_agent_state;

CREATE VIEW v_agent_state 
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
'ADR: View canônica para estado do agente. security_invoker=on garante RLS do caller. Toda UI deve ler estado APENAS desta view.';

-- Controle de acesso explícito
REVOKE ALL ON v_agent_state FROM PUBLIC;
GRANT SELECT ON v_agent_state TO authenticated;
GRANT SELECT ON v_agent_state TO service_role;
```

### 1.4 Criar RPC mark_cron_failure (Alternativa Simplificada)

A função `update_cron_health` já existe mas precisa de wrapper para falhas:

```sql
CREATE OR REPLACE FUNCTION mark_cron_failure(
  p_cron_name TEXT,
  p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM update_cron_health(p_cron_name, false, p_error);
END;
$$;

COMMENT ON FUNCTION mark_cron_failure IS 
'Wrapper simplificado para registrar falha de cron. Chama update_cron_health internamente.';
```

---

## Fase 2: Atualizar Edge Functions (Health Check Callback)

### 2.1 integrity-sentinel

Adicionar chamada a `update_cron_health` após sucesso/erro:

**Linhas 217-230 (sucesso):**
```typescript
// Log success with observability
await supabase.rpc('log_scheduled_job_run', { ... });

// ADICIONAR: Atualizar health check
await supabase.rpc('update_cron_health', {
  p_cron_name: 'integrity-sentinel-15min',
  p_success: true,
  p_error: null
});
```

**Linhas 243-259 (erro):**
```typescript
} catch (err) {
  console.error('[integrity-sentinel] Unhandled error:', err)
  
  // ADICIONAR: Registrar falha no health check
  try {
    await supabase.rpc('update_cron_health', {
      p_cron_name: 'integrity-sentinel-15min',
      p_success: false,
      p_error: err instanceof Error ? err.message : 'Unknown error'
    });
  } catch {}
  
  // Try to log failure
  try {
    await supabase.rpc('log_scheduled_job_run', { ... });
  } catch {}
```

### 2.2 run-rls-tests

Adicionar chamada após resultado:

**Após linha 224:**
```typescript
// ADICIONAR: Atualizar health check
await supabase.rpc('update_cron_health', {
  p_cron_name: 'rls-automated-tests-6h',
  p_success: failedTests.length === 0,
  p_error: failedTests.length > 0 
    ? `${failedTests.length} tests failed` 
    : null
});
```

### 2.3 evaluate-software-risk

Adicionar chamada (quando chamado por cron):

**Após linha 317:**
```typescript
// Se chamado por cron, atualizar health check
const isCronCall = req.headers.get('x-cron-source') === 'true';
if (isCronCall) {
  await supabase.rpc('update_cron_health', {
    p_cron_name: 'evaluate-software-risk-daily',
    p_success: true,
    p_error: null
  });
}
```

---

## Fase 3: Documentar Risco Residual do Rollout

A tabela `agents` não possui colunas `last_seen_task_at` ou `last_error_at`. 

**Risco Residual:** O rollout pode atualizar agentes que:
- Têm heartbeat recente mas estão em loop de erro
- Estão processando tasks críticas

**Mitigação Documentada:**
```sql
-- Rollout SEGURO (campos existentes)
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

-- NOTA: Não há proteção contra agentes em loop de erro.
-- Monitorar v_agent_state após rollout para detectar problemas.
```

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| SQL Migration | CRIAR | Correções de schema |
| `integrity-sentinel/index.ts` | EDITAR | Adicionar health check callback |
| `run-rls-tests/index.ts` | EDITAR | Adicionar health check callback |
| `evaluate-software-risk/index.ts` | EDITAR | Adicionar health check callback |

---

## Checklist de Validação Pós-Migração

```sql
-- 1. Verificar trigger existe
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name = 'tr_prevent_execution_deletion';

-- 2. Verificar view tem security_invoker
SELECT reloptions FROM pg_class 
WHERE relname = 'v_agent_state' AND relkind = 'v';

-- 3. Verificar mark_cron_failure existe
SELECT proname FROM pg_proc WHERE proname = 'mark_cron_failure';

-- 4. Testar delete bloqueado (deve falhar)
DELETE FROM job_executions WHERE id = gen_random_uuid();

-- 5. Verificar health check atualizado (após crons rodarem)
SELECT * FROM v_cron_health;
```

---

## Seção Técnica: SQL Consolidado

```sql
-- ============================================================
-- MIGRAÇÃO: Correções Cirúrgicas Finais
-- ============================================================

BEGIN;

-- 1. Corrigir archive_old_executions (DELETE com CTE)
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
  
  WITH to_delete AS (
    SELECT id FROM job_executions
    WHERE archived_at < NOW() - INTERVAL '30 days'
    LIMIT p_batch_size
  )
  DELETE FROM job_executions je
  USING to_delete td
  WHERE je.id = td.id;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'archived', v_archived,
    'deleted', v_deleted,
    'older_than_days', p_older_than_days
  );
END;
$$;

-- 2. Criar trigger (CRÍTICO)
DROP TRIGGER IF EXISTS tr_prevent_execution_deletion ON job_executions;

CREATE TRIGGER tr_prevent_execution_deletion
  BEFORE DELETE ON job_executions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_execution_deletion();

COMMENT ON TRIGGER tr_prevent_execution_deletion ON job_executions IS 
'ADR: Proteção de imutabilidade. Permite delete apenas de registros arquivados há 30+ dias.';

-- 3. Recriar view com security_invoker
DROP VIEW IF EXISTS v_agent_state;

CREATE VIEW v_agent_state 
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
'ADR: View canônica com security_invoker=on. Toda UI deve ler estado APENAS desta view.';

REVOKE ALL ON v_agent_state FROM PUBLIC;
GRANT SELECT ON v_agent_state TO authenticated;
GRANT SELECT ON v_agent_state TO service_role;

-- 4. Criar wrapper mark_cron_failure
CREATE OR REPLACE FUNCTION mark_cron_failure(
  p_cron_name TEXT,
  p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM update_cron_health(p_cron_name, false, p_error);
END;
$$;

COMMENT ON FUNCTION mark_cron_failure IS 
'Wrapper simplificado para registrar falha de cron.';

COMMIT;
```

---

## Ordem de Execução

1. Executar migração SQL consolidada
2. Validar com checklist
3. Editar 3 Edge Functions (adicionar health check callbacks)
4. Deploy das Edge Functions
5. Aguardar próximo ciclo de crons e verificar `v_cron_health`
