

# Plano de Correção: Erros de Schema e Polling de Agentes

## 📋 Resumo Executivo

Este plano corrige **2 problemas críticos** identificados no sistema:

1. **Erro de schema** - Edge Functions referenciando colunas inexistentes (`handler`, `action_result`)
2. **Agentes não fazendo polling** - 10 de 11 agentes online não estão buscando jobs

---

## 🔧 Fase A: Corrigir Edge Functions com Colunas Inexistentes (P1)

### Problema
As Edge Functions `check-action-effectiveness` e `generate-explainable-report` referenciam:
- `ai_actions.handler` - **NÃO EXISTE** no schema
- `ai_actions.action_result` - **NÃO EXISTE** (o correto é `result`)

### Solução
Atualizar os selects para usar colunas que realmente existem:

**Arquivo: `supabase/functions/check-action-effectiveness/index.ts`**
```typescript
// ANTES (linha 246-251):
.select(`
  id,
  insight_id,
  handler,        // ❌ NÃO EXISTE
  executed_at,
  action_result,  // ❌ NÃO EXISTE
  ...
`)

// DEPOIS:
.select(`
  id,
  insight_id,
  action_type,    // ✅ EXISTE
  executed_at,
  result,         // ✅ EXISTE (jsonb)
  ...
`)
```

**Arquivo: `supabase/functions/generate-explainable-report/index.ts`**
```typescript
// ANTES (linha 153-155):
ai_actions(
  id, action_type, handler, status, executed_at,
  effectiveness_status, effectiveness_evidence
)

// DEPOIS:
ai_actions(
  id, action_type, status, executed_at,
  effectiveness_status, effectiveness_evidence, result
)
```

---

## 🔧 Fase B: Investigar e Corrigir Polling dos Agentes (P0)

### Problema
Apenas **PC-Amanda** está chamando `/poll-jobs`. Os outros 10 agentes online enviam heartbeat mas não fazem polling.

### Evidência
```
PC-Amanda: 18 execuções na última hora ✅
MIT-SERVIDOR: 0 execuções, 8 jobs queued ❌
Pc-Yasmin-Tocantins: 0 execuções, 7 jobs queued ❌
```

### Causa Provável
Os agentes têm versões antigas do script que:
1. Apenas fazem heartbeat via `/agent-heartbeat`
2. Não chamam `/poll-jobs` para buscar trabalho

### Solução
1. **Verificar versão do script instalado** em cada máquina
2. **Reinstalar usando o script preservando credenciais**:
   ```powershell
   irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex
   ```

### Alternativa Imediata
Criar um job de força para atualizar os agentes via force-update:
```sql
-- Forçar atualização dos agentes que não estão executando
UPDATE agents 
SET 
  force_update_version = 'v4.4.0',
  force_update_reason = 'Agente não está fazendo polling de jobs',
  force_update_at = NOW()
WHERE archived_at IS NULL
  AND status = 'active'
  AND last_heartbeat > NOW() - INTERVAL '5 minutes'
  AND id NOT IN (
    SELECT DISTINCT agent_id FROM job_executions 
    WHERE created_at > NOW() - INTERVAL '1 hour'
  );
```

---

## 🔧 Fase C: Limpar DLQ Pendente (P2)

### Problema
2.255 itens pendentes na DLQ.

### Solução
Usar a RPC `process_failed_jobs_dlq` (já criada no plano anterior) ou marcar itens antigos como resolvidos:

```sql
-- Resolver DLQ antiga (>7 dias) automaticamente
UPDATE failed_jobs_dlq
SET 
  status = 'resolved',
  resolution_source = 'auto_cleanup',
  resolution_notes = 'Limpeza automática de itens antigos (>7 dias)',
  resolved_at = NOW()
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '7 days';
```

---

## 📂 Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/check-action-effectiveness/index.ts` | Remover `handler`, `action_result` → usar `action_type`, `result` |
| `supabase/functions/generate-explainable-report/index.ts` | Remover `handler` → usar campos existentes |

---

## ✅ Validação Pós-Correção

1. **Edge Functions**: Deploys sem erros de schema
2. **Polling**: Logs de `poll-jobs` mostrando TODOS os agentes online fazendo polling
3. **Jobs**: Redução de jobs em `queued`, aumento de `completed`
4. **DLQ**: Redução de itens `pending`

---

## 📊 Impacto Esperado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Agentes fazendo polling | 1/11 | 11/11 |
| Jobs queued sem processar | 44 | 0 |
| Erros de schema nos logs | Sim | Não |
| DLQ pendente | 2.255 | <100 |

