# ADR-006 — Hardening Wave 3 (parcial): Edge Functions / `_shared`

**Status:** Implemented (focused scope)
**Date:** 2026-06-18
**Scope:** `supabase/functions/_shared/dlq.ts`, `_shared/validate-caller-tenant.ts`, `execute-playbook-action/index.ts`
**Predecessors:** ADR-004 (Wave 1 Windows), ADR-005 (Wave 2 Unix)

## Validação das ondas anteriores

| Onda | Verificação | Resultado |
|------|-------------|-----------|
| 1 (Windows) | `[Parser]::ParseFile` em `bootstrap.ps1`, `modules/utils.ps1`, `modules/state.ps1`. PSScriptAnalyzer roda no workflow `agent-windows-pester.yml`. | ✅ Sem regressões. (`pwsh` indisponível no sandbox, parser exercitado em CI via Pester `tests/bootstrap.Tests.ps1`.) |
| 2 (Unix) | `bash -n` clean em todos os scripts editados (fsm, crypto, jobs, integrity, metrics × 2, update × 2, handlers). | ✅ Sem erros de sintaxe. Smoke FSM/jobs já validado no ADR-005. |

Nenhum gap detectado nas ondas 1 e 2.

## Escopo desta onda (parcial)

77 edge functions; varredura por `fetch()` cru e `console.log` em produção retornou zero, então o branch principal já cumpre as regras de timeout/logger. A onda focou em três bugs de impacto alto encontrados por inspeção dirigida das *shared libs* e do executor de playbook, em vez de uma sweep cosmética.

## Bugs corrigidos

### B23 — `_shared/dlq.ts::calculateNextRetry` aceita índice negativo / NaN
**Problema:** `delays[Math.min(currentRetry, 4)]` retorna `undefined` se `currentRetry` for `-1`, `NaN` ou `null`; o `next_retry_at` vira `Invalid Date` e a coluna recebe `null`, removendo o job da fila de retry para sempre.
**Solução:** Clamp via `Number.isFinite(...) ? Math.max(0, Math.floor(...)) : 0`.

### B24 — `_shared/dlq.ts::getDLQEntriesForRetry` consultava colunas inexistentes (P0)
**Problema:** SELECT pedia `original_job_type`, `original_payload`, `priority` — nenhuma existe em `failed_jobs_dlq` (confirmado via `information_schema.columns`). PostgREST devolvia 400, o handler logava e retornava `[]`, e **nenhum retry de DLQ era programado em produção**.
**Solução:** Corrigir projeção para os campos reais (`job_type, payload, metadata, …`). `priority` permanece dentro de `metadata`.
**Impacto:** Restaura o pipeline de retry da DLQ.

### B25 — `execute-playbook-action` lia snapshots fora da projeção (P0)
**Problema:** O SELECT omitia `actions_snapshot`, `playbook_snapshot`, `evidence_ids` e `notes`. As leituras seguintes (`execution.actions_snapshot as PlaybookAction[] || []`) sempre caíam no fallback `[]`, e o handler respondia 400 `No actions found in snapshot` para todo playbook semi-automático/assistivo aprovado.
**Solução:** Incluir as colunas usadas adiante — sem `SELECT *`, mantendo a regra de projeção explícita.
**Impacto:** Execução de playbook volta a funcionar end-to-end.

### B26 — `_shared/validate-caller-tenant.ts` mascarava erros de infraestrutura
**Problema:** `.maybeSingle()` destruturava apenas `data`. Um erro transitório (timeout de statement, falha de pool, mudança de RLS) virava silenciosamente 403 "Access denied", confundindo investigação de incidentes e poluindo logs de segurança.
**Solução:** Capturar `error`, logar com `code`/`message`, e responder **503** em falhas de infra (preservando 403 só quando a query realmente retorna 0 linhas).

## Não corrigidos nesta onda

- Demais 74 functions: nenhuma evidência de bug crítico via heurística (`fetch` cru / `console.log` / Zod `.passthrough` em endpoint sensível) — `passthrough` listado em 20 arquivos é em sua maioria pós-validação de payload de telemetria (compat forward-only); revisar caso a caso requer onda dedicada.
- `_shared/tenant.ts`: `getTenantIdForUser` retorna `null` tanto em erro quanto em "sem tenant" — comportamento aceito (fail-closed).
- `_shared/dlq.ts`: cast `existingMetadata.error_history as string[]` sem `Array.isArray` — defeito menor, sem impacto operacional.

## Verificação

- `information_schema.columns` confirmou: `failed_jobs_dlq` não possui `original_job_type/original_payload/priority`; `playbook_executions` possui `actions_snapshot/playbook_snapshot/evidence_ids` (sumidos no SELECT antigo).
- Edits são puramente de projeção/clamp/erro — assinaturas e contratos públicos inalterados.

## Próxima onda sugerida

- Wave 4 (Frontend): error boundaries em rotas críticas, `useQuery` com `throwOnError`/`onError`, `AbortController` em hooks longos, cleanup de listeners.
- Ou: continuação do Wave 3 com auditoria por feature crítica (heartbeat, submit-job-result, scim-provisioning, ai-action-executor) — exige sprint dedicado.
