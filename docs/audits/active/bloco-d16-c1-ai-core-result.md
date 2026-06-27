# D16-C1 — AI Core (Result)

**Data:** 2026-06-27
**Escopo:** Saneamento de `@ts-nocheck` em handlers de IA core: `ai-router/*`,
`ai-system-audit/*`, `ai-agent-assist/*`. (`ai-system-analyzer/*` e
`ai-action-executor/*` rebatidos para hotfix posterior — bugs latentes SQL.)

---

## 1. Resultado

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| `@ts-nocheck` ativos (`supabase/functions/`) | 40 | **33** |
| Arquivos no gate Tier 1 | 100 | **108** |
| Redução acumulada vs baseline D13 (96) | ~58% | **~66%** |

`deno check` PASS em todos os alvos saneados e no entrypoint `ai-router/index.ts`
(que importa os 3 handlers diretos).

---

## 2. Arquivos saneados (7)

| Arquivo | Mudança | Runtime |
| --- | --- | --- |
| `ai-router/index.ts` | Remoção de `@ts-nocheck`; correto via correções nos handlers consumidos | preservado |
| `ai-router/handlers/correlate-alerts.ts` | Cast `as never` no insert de `ai_insights` (type-only) | preservado |
| `ai-router/handlers/execute-solution.ts` | Casts `as never` em 2 inserts de `jobs` e no update de `ai_actions.result` | preservado |
| `ai-router/handlers/security-copilot.ts` | Remoção limpa (já passava) | preservado |
| `ai-system-audit/index.ts` | Cast `as Record<string,unknown>` em `metrics` (rpc retorna `Json`); cast no insert | preservado |
| `ai-system-audit/dimension-mapper.ts` | Remoção limpa | preservado |
| `ai-agent-assist/index.ts` | Remoção limpa | preservado |

Nenhum prompt, modelo, provider, retry, timeout, cache, payload, contrato HTTP
ou SQL foi alterado.

---

## 3. Arquivos rebatidos (3) — bugs latentes detectados

Diretivas `@ts-nocheck` mantidas; bugs registrados para hotfix isolado pós-D16.

### LATENT-AI-01 — `installation_analytics` colunas inexistentes

Em `ai-system-analyzer/index.ts:60` o select pede `success, error_message, step,
duration_ms`. Schema real expõe `event_type, error_message,
installation_time_seconds, success` — **`step` e `duration_ms` não existem**.
Postgres 42703 ao executar; resultado consumido sem dados úteis na análise.

### LATENT-AI-02 — `agent_system_metrics_partitioned` colunas inexistentes

Em `ai-system-analyzer/index.ts:61` o select pede
`agent_name, cpu_usage, memory_usage, disk_usage`. Schema real expõe
`cpu_usage_percent, memory_usage_percent, disk_usage_percent` e **não tem
`agent_name`** (precisa JOIN com `agents`). Idem em
`ai-system-analyzer/analysis-engine.ts` (consumidor downstream).

### LATENT-AI-03 — `ai_action_configs.rate_limit_per_hour` inexistente

Em `ai-action-executor/index.ts` o select de `ai_action_configs` referencia
`rate_limit_per_hour, is_enabled, requires_approval`. Schema real expõe
`max_executions_per_day, is_enabled, requires_approval` — **a coluna de
rate-limit foi renomeada / nunca foi criada**. Quebra o circuit-breaker.

### LATENT-AI-04 — `jobs.payload_hash` ausente em inserts dos handlers

Aparece em `ai-router/handlers/execute-solution.ts` (linhas 68, 93). Bypassado
com `as never` para não bloquear o saneamento; depende de trigger DB ou de
helper compartilhado para popular `payload_hash`. Mesmo padrão de
`LATENT-AUTOMATION-03` em `auto-remediate`. Promover ambos para
**HF-JOBS-PAYLOAD-HASH-01** numa única passada.

---

## 4. Gates

- ✅ `deno check` nos 7 alvos saneados.
- ✅ `deno check ai-router/index.ts` (entrypoint que importa os handlers).
- ✅ `scripts/guard-no-ts-nocheck-tier1.sh` PASS com **108 arquivos protegidos**.

---

## 5. Próxima onda recomendada

Antes de prosseguir para **D16-C2 (AI Analysis)**:

1. Abrir **HF-AI-SCHEMA-DRIFT-01** corrigindo LATENT-AI-01/02/03 em conjunto
   (escopo: apenas `.select()` para colunas reais; sem mudar lógica).
2. Abrir **HF-JOBS-PAYLOAD-HASH-01** unificando LATENT-AI-04 +
   LATENT-AUTOMATION-03 (preferencialmente via helper de `_shared`).

Após esses dois hotfixes, `ai-system-analyzer/*` e `ai-action-executor/*`
voltam a estar elegíveis a saneamento — e podem ser absorvidos na D16-C2.
