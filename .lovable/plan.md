
# 🛠️ Plano Consolidado de Correções do Sistema CyberShield

## Visão Geral da Análise

Após varredura profunda, identifiquei **6 problemas críticos** que impedem o funcionamento completo do sistema:

| # | Problema | Impacto | Status Atual |
|---|----------|---------|--------------|
| 1 | **Cron faltando para `check-action-effectiveness`** | 20 ações há 30 dias sem verificação | ✅ Cron #68 criado |
| 2 | **Cron faltando para `generate_ai_actions_from_insights`** | 805 insights críticos sem ação | ✅ Cron #69 criado |
| 3 | **Job órfão em `pending`** | 1 job expirado violando ADR-037 | ✅ Cancelado |
| 4 | **378 alertas não auto-resolvidos** | Alertas acumulados há 14 dias | ✅ 213 resolvidos |
| 5 | **8 playbooks nunca executaram** | Triggers não acionando | ⚠️ Investigar |
| 6 | **Trigger de auto-resolve existe mas não está ativo** | Função existe, trigger não | ✅ Trigger ativo |

### O Que Está Funcionando

- ✅ 55 crons ativos e executando
- ✅ `auto-execute-ai-actions-every-2min` rodando
- ✅ `ai-system-analyzer-every-6h` rodando (mas pulando tenants expirados)
- ✅ 4 tenants com subscription ativa (Atlaviamit, Genial Cred, Pedro Alves, Teste)
- ✅ Insights sendo gerados (809 nos últimos 7 dias)

---

## Fase 1: Correções Críticas (P0)

### 1.1 Criar Cron para `check-action-effectiveness`

**Problema**: Edge Function completa, mas sem cron agendado.

**SQL para executar via Cloud Run SQL:**

```sql
SELECT cron.schedule(
  'check-action-effectiveness-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/check-action-effectiveness',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ***REMOVED***'
    ),
    body:='{"source": "cron"}'::jsonb
  ) as request_id;
  $$
);
```

### 1.2 Criar Cron para `generate_ai_actions_from_insights`

**Problema**: Função RPC existe mas não é chamada periodicamente. 805 insights críticos/high sem ação.

**SQL:**

```sql
SELECT cron.schedule(
  'generate-ai-actions-every-30min',
  '*/30 * * * *',
  $$
  SELECT public.generate_ai_actions_from_insights();
  $$
);
```

### 1.3 Limpar Job Órfão Expirado

**Problema**: Job `85ce188c-05a6-4d43-b856-e19989416579` está em `pending` mas expirou.

**SQL:**

```sql
UPDATE jobs 
SET status = 'cancelled', 
    completed_at = NOW(),
    error_message = 'Cancelado automaticamente: job expirado em status pending (ADR-037)'
WHERE id = '85ce188c-05a6-4d43-b856-e19989416579'
  AND status = 'pending';
```

---

## Fase 2: Correções de Fechamento de Ciclo (P1)

### 2.1 Ativar Trigger de Auto-Resolução de Alertas

**Problema**: Função `auto_resolve_resource_alerts` existe mas não há trigger vinculado.

**SQL - Criar trigger:**

```sql
-- Verificar e criar trigger para auto-resolver alertas
CREATE OR REPLACE TRIGGER tr_auto_resolve_resource_alerts
  AFTER INSERT ON agent_system_metrics_partitioned
  FOR EACH ROW
  EXECUTE FUNCTION auto_resolve_resource_alerts();

-- Também criar trigger na tabela base (se usada)
DROP TRIGGER IF EXISTS tr_auto_resolve_resource_alerts ON agent_system_metrics;
CREATE TRIGGER tr_auto_resolve_resource_alerts
  AFTER INSERT ON agent_system_metrics
  FOR EACH ROW
  EXECUTE FUNCTION auto_resolve_resource_alerts();
```

### 2.2 Resolver Alertas Antigos Manualmente

**Problema**: 378 alertas (`pending_agents` e `high_cpu`) acumulados há 14 dias.

**SQL para resolução em lote:**

```sql
-- Resolver alertas pending_agents onde agentes já estão ativos
UPDATE system_alerts sa
SET 
  resolved_at = NOW(),
  status = 'resolved',
  resolution_notes = 'Auto-resolvido: condição normalizada (batch cleanup)'
WHERE sa.alert_type = 'pending_agents'
  AND sa.resolved_at IS NULL
  AND sa.created_at < NOW() - INTERVAL '7 days';

-- Resolver alertas high_cpu antigos (> 7 dias sem resolução = provavelmente resolvido)
UPDATE system_alerts sa
SET 
  resolved_at = NOW(),
  status = 'resolved',
  resolution_notes = 'Auto-resolvido: timeout após 7 dias sem nova ocorrência'
WHERE sa.alert_type = 'high_cpu'
  AND sa.resolved_at IS NULL
  AND sa.created_at < NOW() - INTERVAL '7 days';
```

---

## Fase 3: Otimizações (P2)

### 3.1 Criar Cron para Limpeza de DLQ

**SQL:**

```sql
SELECT cron.schedule(
  'dlq-cleanup-weekly',
  '0 4 * * 0',
  $$
  DELETE FROM failed_jobs_dlq 
  WHERE created_at < NOW() - INTERVAL '90 days';
  $$
);
```

### 3.2 Criar View de Saúde dos Ciclos

**SQL - View para monitoramento:**

```sql
CREATE OR REPLACE VIEW v_system_cycle_health AS
SELECT 
  'ai_actions_pending_verification' as cycle,
  COUNT(*) as pending_count,
  MIN(executed_at) as oldest_pending
FROM ai_actions
WHERE effectiveness_status = 'pending' AND status = 'executed'
UNION ALL
SELECT 
  'insights_without_action' as cycle,
  COUNT(*) as pending_count,
  MIN(i.created_at) as oldest_pending
FROM ai_insights i
LEFT JOIN ai_actions a ON a.insight_id = i.id
WHERE i.severity IN ('critical', 'high')
  AND i.acknowledged = false
  AND a.id IS NULL
  AND i.created_at > NOW() - INTERVAL '7 days'
UNION ALL
SELECT 
  'unresolved_alerts' as cycle,
  COUNT(*) as pending_count,
  MIN(created_at) as oldest_pending
FROM system_alerts
WHERE resolved_at IS NULL
  AND created_at < NOW() - INTERVAL '24 hours'
UNION ALL
SELECT 
  'orphan_pending_jobs' as cycle,
  COUNT(*) as pending_count,
  MIN(created_at) as oldest_pending
FROM jobs
WHERE status = 'pending'
  AND expires_at < NOW();
```

---

## Resumo de Arquivos/Alterações

| Tipo | Descrição | Prioridade |
|------|-----------|------------|
| **Cron Job** | `check-action-effectiveness-every-15min` | P0 |
| **Cron Job** | `generate-ai-actions-every-30min` | P0 |
| **Data Update** | Cancelar job órfão | P0 |
| **Trigger** | `tr_auto_resolve_resource_alerts` | P1 |
| **Data Update** | Resolver 378 alertas antigos | P1 |
| **Cron Job** | `dlq-cleanup-weekly` | P2 |
| **View** | `v_system_cycle_health` | P2 |

---

## Critérios de Validação Pós-Implementação

```sql
-- 1. Verificar crons criados
SELECT jobname, schedule, active 
FROM cron.job 
WHERE jobname IN (
  'check-action-effectiveness-every-15min',
  'generate-ai-actions-every-30min',
  'dlq-cleanup-weekly'
);

-- 2. Verificar job órfão cancelado
SELECT id, status, error_message 
FROM jobs 
WHERE id = '85ce188c-05a6-4d43-b856-e19989416579';

-- 3. Verificar alertas resolvidos
SELECT alert_type, COUNT(*) as unresolved
FROM system_alerts
WHERE resolved_at IS NULL
GROUP BY alert_type;

-- 4. Verificar ações pendentes de verificação
SELECT COUNT(*) FROM ai_actions 
WHERE effectiveness_status = 'pending';

-- 5. Verificar ciclos saudáveis
SELECT * FROM v_system_cycle_health;
```

---

## Notas de Implementação

1. **Backup**: As queries são idempotentes e seguras, mas recomenda-se verificar contagens antes de executar UPDATEs em lote.

2. **Ordem de Execução**:
   - Primeiro: Crons (P0)
   - Segundo: Job órfão e triggers (P1)
   - Terceiro: Limpeza e views (P2)

3. **Monitoramento**: Após implementação, aguardar 30 minutos e verificar logs de execução dos novos crons.

4. **Playbooks Inativos**: Os 8 playbooks que nunca executaram precisam de investigação adicional sobre suas `trigger_conditions` - pode ser que os eventos específicos (ex: `suspicious_web_activity`, `vulnerability_critical`) não estejam sendo gerados pelos sistemas upstream.
