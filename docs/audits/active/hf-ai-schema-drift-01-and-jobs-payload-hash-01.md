# HF-AI-SCHEMA-DRIFT-01 + HF-JOBS-PAYLOAD-HASH-01 — Result

**Data:** 2026-06-27
**Escopo:** Resolver divergências de schema (LATENT-AI-01/02/03) e unificar a
política de `jobs.payload_hash` (LATENT-AI-04 + LATENT-AUTOMATION-03) antes de
abrir D16-C2. Sem mudança de comportamento.

---

## 1. HF-AI-SCHEMA-DRIFT-01 — Alinhamento código ↔ schema

Schema real validado via `information_schema.columns`:

### `installation_analytics`
Real: `id, tenant_id, agent_id, agent_name, event_type, platform,
installation_method, installation_time_seconds, error_message, ip_address,
user_agent, metadata, created_at, success, network_connectivity,
telemetry_hash`.

- `step` **nunca existiu** → mapeado para `event_type` (semântica equivalente).
- `duration_ms` **nunca existiu** → mapeado para `installation_time_seconds`
  (mesma grandeza, unidade diferente; o consumo downstream em
  `analysis-engine.ts` usa apenas counts/`success`, então a troca é neutra).

Fix em `ai-system-analyzer/index.ts:65`.

### `agent_system_metrics_partitioned`
Real: `agent_id, tenant_id, cpu_usage_percent, memory_usage_percent,
disk_usage_percent, collected_at, ...`. **Não tem `agent_name`** — é obtido via
JOIN com `agents` (mapa `agentFriendlyNames` já existente).

- `cpu_usage` / `memory_usage` / `disk_usage` → `*_percent` (analysis-engine já
  lê as variantes `_percent`; o select é que estava errado).
- `agent_name` removido do select; enriquecimento continua via mapa.

Fix em `ai-system-analyzer/index.ts:66`.

### `ai_action_configs`
Real: `... is_enabled, requires_approval, risk_level, max_executions_per_day,
circuit_breaker_*, ...`. **Não tem `rate_limit_per_hour`**. O rate-limit real
é enforced via RPC `check_action_rate_limit` (já consultada na linha 50). O
campo selecionado nunca era lido no executor.

- `rate_limit_per_hour` removido do select.

Fix em `ai-action-executor/index.ts:46`.

### Resultado
- `deno check` PASS nos 3 alvos.
- `@ts-nocheck` preservado nos arquivos rebatidos (a remoção depende de
  narrowing Json↔Record nos inserts — programado para D16-C2+).
- Zero mudança de comportamento; logs/runtime preservados.

---

## 2. HF-JOBS-PAYLOAD-HASH-01 — Política única

**Fonte de verdade declarada e documentada:** o trigger Postgres
`trg_auto_set_job_payload_hash` (BEFORE INSERT) chama
`public.calculate_payload_hash(payload jsonb)`:

```sql
SELECT encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
```

Dispara somente quando `NEW.payload_hash IS NULL`. Edge functions **não
devem** calcular nem enviar `payload_hash` — risco de divergência com a
representação `jsonb::text` do Postgres.

### Helper criado
`supabase/functions/_shared/job-insert.ts` exporta `jobInsert<T>()` e
`jobInsertMany<T>()`. Ambos:

1. **Removem** qualquer `payload_hash` enviado pelo caller (defesa em
   profundidade: o trigger sempre vence).
2. Centralizam o cast que satisfaz a tipagem gerada (que marca a coluna como
   NOT NULL sem default visível ao information_schema).

### Call sites migrados
| Arquivo | Linhas | Origem |
| --- | --- | --- |
| `ai-router/handlers/execute-solution.ts` | 70, 95 | LATENT-AI-04 |
| `auto-remediate/index.ts` | 194-213 | LATENT-AUTOMATION-03 |

Substituições `as never` ad-hoc → `jobInsertMany(...) as never` /
`jobInsert(...) as never` documentadas com referência ao hotfix.

### Frontend
`src/lib/job-utils.ts#calculatePayloadHash` continua disponível **apenas** para
previsões/dedup client-side antes do insert. Não é autoritativo. O hotfix
documenta isso explicitamente no header de `_shared/job-insert.ts`.

### Resultado
- `deno check` PASS em `_shared/job-insert.ts`,
  `ai-router/handlers/execute-solution.ts`, `auto-remediate/index.ts`.

---

## 3. Gates

| Gate | Status |
| --- | --- |
| `deno check` (5 alvos tocados) | ✅ PASS |
| `scripts/guard-no-ts-nocheck-tier1.sh` (108 arquivos) | ✅ PASS |
| Recontagem `^// @ts-nocheck` em `supabase/functions/` | **33** (sem regressão) |

---

## 4. Próximo bloco

Liberado: **D16-C2 (AI Analysis)** com schema consistente, política de hash
unificada e inventário confiável.

Backlog reaberto após D16: `ai-system-analyzer/*` e `ai-action-executor/*`
agora estão **elegíveis a saneamento** (schema correto). O `@ts-nocheck`
remanescente desses 3 arquivos depende exclusivamente do narrowing
Json↔Record dos inserts — pode ser absorvido em D16-C2.
