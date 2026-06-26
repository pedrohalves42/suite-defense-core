# D12-A — Inventário `_shared` com `@ts-nocheck` ativo

Data: 2026-06-26
Modo: **read-only** (nenhuma diretiva removida, nenhum runtime alterado).
Regex usada (D11-A): `^\s*(//|/\*)\s*@ts-nocheck\b`

---

## 1. Objetivo

Mapear os 8 arquivos restantes em `supabase/functions/_shared/**` que ainda contêm
`@ts-nocheck` ativo, identificar consumers, medir o erro real exposto ao remover a
diretiva, classificar por criticidade e propor ordem segura para o D12-B.

---

## 2. Arquivos `_shared` com diretiva ativa (8 total)

| # | Arquivo | Linha | Função provável | Consumers (#) | Criticidade |
|---|---------|------:|------------------|--------------:|:-----------:|
| 1 | `_shared/ip-allowlist.ts` | 1 | Middleware admin IP allowlist (segurança perimetral) | 0 diretos detectados | **S1** |
| 2 | `_shared/submit-handlers/web-activity-helpers.ts` | 1 | Classificação/bloqueio de domínios para submit-hmac-router | 1 (`submit-handlers/web-activity.ts`) | **S1** |
| 3 | `_shared/submit-handlers/alert-engine.ts` | 1 | Geração/auto-resolução de alertas em system metrics | 1 (`submit-handlers/system-metrics.ts`) | **S2** |
| 4 | `_shared/dlq.ts` | 1 | Dead-letter queue de jobs + backoff | 2 (`ops-sync/handlers/sync-jobs.ts`, `ops-gateway/handlers/sync-jobs.ts`) | **S2** |
| 5 | `_shared/ai-multi-provider.ts` | 1 | Orquestrador AI multi-provider (router + circuit breaker) | 6 (api-gateway/translate-cve, ai-router/provider-status, hexagonal smart-router-*, ai-provider-helper) | **S3** |
| 6 | `_shared/hexagonal/adapters.ts` | 1 | Adapters Supabase do core hexagonal (update jobs/events) | 1 (`hexagonal/index.ts` → re-export) | **S3** |
| 7 | `_shared/ai-evidence-types.ts` | 1 | Tipos puros do Evidence Pack de AI insights | 3 (ai-analyze-agent, ai-system-analyzer/analysis-engine, ops-gateway/check-analytics) | **S4** |
| 8 | `_shared/domain-events.ts` | 1 | Dispatcher de domain events (tabela imutável) | 0 diretos detectados (uso interno futuro) | **S4** |

---

## 3. Resultado do `deno check` por arquivo (com `@ts-nocheck` temporariamente removido)

| Arquivo | Resultado | Erros | Tipo de erro | Causa provável |
|---------|-----------|------:|--------------|----------------|
| `ip-allowlist.ts` | **PASS** | 0 | — | Diretiva obsoleta (código já tipa-safe) |
| `web-activity-helpers.ts` | **PASS** | 0 | — | Diretiva obsoleta |
| `alert-engine.ts` | **PASS** | 0 | — | Diretiva obsoleta |
| `dlq.ts` | **PASS** | 0 | — | Diretiva obsoleta |
| `ai-multi-provider.ts` | **PASS** | 0 | — | Diretiva obsoleta após refatoração v3.0 |
| `hexagonal/adapters.ts` | **PASS** | 0 | — | Diretiva obsoleta |
| `ai-evidence-types.ts` | **PASS** | 0 | — | Arquivo puro de tipos, diretiva sempre foi inútil |
| `domain-events.ts` | **FAIL** | 1 | `TS2769` em `new Date(row.occurred_on)` (linha 57) — `row` é `unknown` | Falta narrowing/type guard ao mapear a select da tabela `domain_events` |

> Nota: o `deno check` foi feito copiando o arquivo para um tmp, removendo a linha 1
> com `sed`, rodando o check, e restaurando o original. Nenhuma diretiva foi
> efetivamente removida do repositório.

---

## 4. Classificação por risco

### S1 — auth/security/tenant/billing/public edge
- `ip-allowlist.ts` — middleware perimetral de admin.
- `submit-handlers/web-activity-helpers.ts` — classificação/bloqueio aplicada a tráfego real de agentes via submit-hmac-router.

### S2 — logging/validation/utils usados amplamente
- `submit-handlers/alert-engine.ts` — gera alertas a partir de métricas de sistema.
- `dlq.ts` — usado por jobs em 2 caminhos (ops-sync e ops-gateway).

### S3 — helpers internos/AI/automation
- `ai-multi-provider.ts` — orquestrador AI; impacto multi-consumer (6), mas isolado da auth/HMAC.
- `hexagonal/adapters.ts` — usado apenas via barrel `hexagonal/index.ts`.

### S4 — legado / baixo uso / tipos puros
- `ai-evidence-types.ts` — apenas `interface`/`type`, sem runtime.
- `domain-events.ts` — sem consumer direto detectado; único arquivo com erro real (TS2769).

---

## 5. Ordem recomendada de limpeza (D12-B)

A maioria das diretivas é **obsoleta** (7 de 8 passam no `deno check` sem nenhuma
alteração). Isso permite uma ordem segura e barata:

```txt
Onda 1 (zero-risk, type-only, sem erros):
  D12-B1  ai-evidence-types.ts            (S4, tipos puros)
  D12-B2  ip-allowlist.ts                  (S1, security perimetral)
  D12-B3  web-activity-helpers.ts          (S1, classificação domínios)

Onda 2 (consumers operacionais, sem erros):
  D12-B4  alert-engine.ts                  (S2)
  D12-B5  dlq.ts                           (S2, 2 consumers)
  D12-B6  hexagonal/adapters.ts            (S3, barrel-only)
  D12-B7  ai-multi-provider.ts             (S3, 6 consumers — rodar deno check em todos)

Onda 3 (única correção type-only real necessária):
  D12-B8  domain-events.ts                 (S4, fix TS2769 com narrowing)
```

Justificativa da ordem:
1. Começar pelos arquivos sem erro garante ganho imediato de cobertura sem risco.
2. S1 sobe na fila dentro da Onda 1 por relevância de segurança (mesmo sem erro,
   queremos que o gate proteja primeiro o que mais importa).
3. `ai-multi-provider.ts` fica por último na Onda 2 porque tem 6 consumers e exige
   `deno check` cruzado.
4. `domain-events.ts` é o único que requer mudança type-only de código (narrowing
   no `row.occurred_on`). Vai isolado na Onda 3 para não misturar com remoções
   triviais.

---

## 6. Riscos residuais

- **`ai-multi-provider.ts`**: 6 consumers. Mesmo com `deno check` passando no
  helper, é mandatório rodar `deno check` em cada consumer durante o D12-B7. Se
  algum consumer dependia de tipos frouxos, vai aparecer agora.
- **`domain-events.ts`**: o `row` vem de uma select com `<any>` no `createClient`.
  A correção mínima é tipar a row local (`{ occurred_on: string; ... }`) ou usar
  `String(row.occurred_on)`. Não tocar no contrato do `dispatch()`.
- **`hexagonal/adapters.ts`**: re-export via `hexagonal/index.ts`. Validar que o
  barrel continua compilando após remover a diretiva.
- **Dois espelhos de `database.types.ts`** (`src/...` e `_shared/...`) seguem
  como dívida fora do escopo D12 — registrada em D11-B.
- **Cache do `deno check`**: o primeiro check baixa o grafo do `@supabase/supabase-js`.
  Executar as ondas em sequência aproveita o cache.

---

## 7. Próximo passo

Aguardar autorização explícita para `D12-B1` (limpeza do primeiro arquivo da
Onda 1: `ai-evidence-types.ts`). Nenhuma remoção ocorre sem aprovação por arquivo
ou por onda.
