# Runbook: Dead-Letter Queue (DLQ)

> **Versão:** 1.0 | **Última atualização:** 2026-04-02 | **Autor:** Equipe CyberShield  
> **Tabela:** `failed_jobs_dlq` | **Processador:** `process-dlq-retries`

---

## Índice

1. [Objetivo](#objetivo)
2. [Pré-requisitos](#pré-requisitos)
3. [Visão Geral](#visão-geral)
4. [Causas Comuns de Entrada na DLQ](#causas-comuns)
5. [Consultar Mensagens na DLQ](#consultar-mensagens)
6. [Reprocessar Mensagens](#reprocessar-mensagens)
7. [Limpeza e Retenção](#limpeza-e-retenção)
8. [Monitoramento e Alertas](#monitoramento-e-alertas)
9. [Troubleshooting](#troubleshooting)

---

## Objetivo

Documentar a operação, consulta e manutenção da **Dead-Letter Queue (DLQ)** do CyberShield, que armazena jobs que falharam após todas as tentativas de retentativa para análise posterior e reprocessamento manual.

## Pré-requisitos

- Acesso de leitura ao banco de dados (tabela `failed_jobs_dlq`)
- Acesso de escrita para reprocessamento (role `service_role`)
- Conhecimento do ciclo de vida de jobs (9 estados: PENDING → EXPIRED)

## Visão Geral

A DLQ é uma tabela (`failed_jobs_dlq`) que recebe jobs que esgotaram suas retentativas (máximo de 3, conforme ADR-042). O processador `process-dlq-retries` é executado periodicamente para tentar reprocessar jobs elegíveis.

### Fluxo do Job até a DLQ

```
Job criado (PENDING)
    ↓
Despacho para agente (DISPATCHED)
    ↓
Execução (EXECUTING)
    ↓ falha
Retentativa (até 3x)
    ↓ todas falharam
Dead-Letter Queue (failed_jobs_dlq)
    ↓
Análise manual ou reprocessamento automático
```

## Causas Comuns de Entrada na DLQ {#causas-comuns}

| Causa | Descrição | Frequência |
|-------|-----------|------------|
| **Agente offline** | Job despachado para agente que ficou offline | Alta |
| **Timeout de execução** | Job excedeu TTL de 4 horas | Média |
| **Falha de execução** | Erro no script/comando executado pelo agente | Média |
| **Conflito de versão** | Agente com versão incompatível com o job | Baixa |
| **Payload inválido** | Dados do job corrompidos ou malformados | Rara |
| **Limite de blast radius** | Job bloqueado por exceder 10% da frota | Baixa |

## Consultar Mensagens na DLQ {#consultar-mensagens}

### Total de mensagens na DLQ

```sql
SELECT count(*) AS total_dlq
FROM failed_jobs_dlq
WHERE tenant_id = 'SEU_TENANT_ID';
```

### Mensagens por causa de falha

```sql
SELECT 
  error_category,
  count(*) AS total,
  min(created_at) AS mais_antiga,
  max(created_at) AS mais_recente
FROM failed_jobs_dlq
WHERE tenant_id = 'SEU_TENANT_ID'
GROUP BY error_category
ORDER BY total DESC;
```

### Mensagens das últimas 24 horas

```sql
SELECT 
  id,
  job_id,
  agent_id,
  error_message,
  retry_count,
  created_at
FROM failed_jobs_dlq
WHERE tenant_id = 'SEU_TENANT_ID'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 50;
```

### Jobs específicos de um agente

```sql
SELECT 
  id,
  job_id,
  error_message,
  payload,
  created_at
FROM failed_jobs_dlq
WHERE agent_id = 'ID_DO_AGENTE'
  AND tenant_id = 'SEU_TENANT_ID'
ORDER BY created_at DESC;
```

## Reprocessar Mensagens

### Via processador automático (`process-dlq-retries`)

O edge function `process-dlq-retries` é executado via cron e tenta reprocessar jobs elegíveis automaticamente. Ele verifica:

1. Se o agente de destino está online
2. Se o número de retentativas não excedeu o limite
3. Se o job ainda é relevante (não expirou)

### Reprocessamento manual (via SQL)

> ⚠️ **Requer privilégios administrativos (service_role)**

```sql
-- Recriar o job a partir da DLQ
INSERT INTO jobs (
  tenant_id, agent_id, job_type, payload, 
  status, created_at, retry_count
)
SELECT 
  tenant_id, agent_id, job_type, payload,
  'PENDING', now(), 0
FROM failed_jobs_dlq
WHERE id = 'ID_DA_MENSAGEM_DLQ'
  AND tenant_id = 'SEU_TENANT_ID';

-- Marcar como reprocessada na DLQ
UPDATE failed_jobs_dlq 
SET reprocessed_at = now(),
    reprocessed_by = 'admin@empresa.com'
WHERE id = 'ID_DA_MENSAGEM_DLQ';
```

## Limpeza e Retenção

### Política de retenção

Conforme a **Política de Retenção de Dados (06)**, mensagens na DLQ devem ser mantidas por **90 dias** para auditoria antes de serem purgadas.

### Purge de mensagens obsoletas

```sql
-- Listar candidatas a purge (>90 dias)
SELECT count(*) 
FROM failed_jobs_dlq
WHERE created_at < now() - interval '90 days'
  AND tenant_id = 'SEU_TENANT_ID';

-- Executar purge (REQUER service_role)
DELETE FROM failed_jobs_dlq
WHERE created_at < now() - interval '90 days'
  AND tenant_id = 'SEU_TENANT_ID';
```

## Monitoramento e Alertas

### Métricas recomendadas

| Métrica | Threshold de Alerta | Ação |
|---------|---------------------|------|
| Total de mensagens na DLQ | > 100 em 1h | Investigar causa raiz |
| Taxa de entrada na DLQ | > 10/min | Verificar saúde dos agentes |
| Mensagens não reprocessadas > 24h | > 50 | Reprocessar manualmente |
| DLQ crescendo consistentemente | Tendência de alta em 7 dias | Revisar configuração de jobs |

### Query de monitoramento

```sql
SELECT 
  date_trunc('hour', created_at) AS hora,
  count(*) AS entradas_dlq
FROM failed_jobs_dlq
WHERE tenant_id = 'SEU_TENANT_ID'
  AND created_at > now() - interval '24 hours'
GROUP BY hora
ORDER BY hora DESC;
```

## Troubleshooting

| Sintoma | Causa Provável | Ação |
|---------|---------------|------|
| DLQ crescendo rapidamente | Muitos agentes offline | Verificar conectividade da frota |
| Jobs reprocessados falham novamente | Causa raiz não resolvida | Analisar `error_message` e corrigir |
| `process-dlq-retries` não executa | Cron job desabilitado ou com erro | Verificar logs do edge function |
| Mensagens sem `agent_id` | Job órfão (agente deletado) | Limpar ou reatribuir manualmente |
| Payload corrompido | Erro de serialização | Descartar e recriar o job |

### Verificação de Sucesso

Após reprocessamento, confirme:

```sql
-- Verificar que o job foi recriado com sucesso
SELECT id, status, created_at 
FROM jobs
WHERE tenant_id = 'SEU_TENANT_ID'
  AND created_at > now() - interval '1 hour'
  AND status = 'PENDING'
ORDER BY created_at DESC;
```

---

**Referências:**
- `failed_jobs_dlq` — Tabela da DLQ
- `process-dlq-retries` — Edge function de reprocessamento
- ADR-042 — Governança do Ciclo de Vida de Jobs
- Política 06 — Retenção de Dados
