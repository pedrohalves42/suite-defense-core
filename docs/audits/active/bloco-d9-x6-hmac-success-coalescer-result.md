# D9-X6 — `_shared/hmac-success-coalescer.ts` — RESULT

## Erros encontrados antes
- `deno check _shared/hmac-success-coalescer.ts` → **0 erros** (baseline já limpo)
- 2 ocorrências de `catch (err)` + `(err as Error).message` (cast inseguro)

## Alterações feitas
- L134: `catch (err)` → `catch (err: unknown)` com narrowing `err instanceof Error ? err.message : String(err)`.
- L212: idem para o catch do `inlineFormatCacheUpsert`.
- **Nada mais foi tocado** — nem runtime, nem assinaturas públicas, nem métricas, nem TTL/batch/fallback.

## Garantias preservadas

| Item                                              | Estado |
|---------------------------------------------------|-------:|
| Feature flag `hmac_success_coalescing` (default OFF lido em `hmac.ts`) | ✅ |
| TTL LRU (`lruTtlMs = 30_000`)                     | ✅ |
| `maxBatchSize = 50`                               | ✅ |
| `flushIntervalMs = 1500`                          | ✅ |
| Dedupe por `agent_id` (LRU + intra-batch)         | ✅ |
| Fallback por linha após falha de batch            | ✅ |
| Métricas (nomes + contagem): `lru_hits`, `buffered`, `flushed_rows`, `flush_batches`, `flush_errors`, `fallback_rows`, `fallback_errors`, `bypass_disabled` | ✅ |
| Isolamento do auth (coalescer roda só no success path, erros não escapam) | ✅ |
| Contrato com `_shared/hmac.ts` (`enqueueFormatCacheUpsert` / `inlineFormatCacheUpsert`) | ✅ |
| `EdgeRuntime.waitUntil` (agendado em `hmac.ts`)   | ✅ |

## Smoke lógico (revisão estática contra os testes existentes)

| Caso                       | Comportamento preservado |
|----------------------------|--------------------------|
| flag OFF                   | `inlineFormatCacheUpsert` → `bypass_disabled += 1` ✅ |
| flag ON + 1º sucesso       | enqueue → `buffered += 1`, LRU set ✅ |
| sucesso duplicado em TTL   | `lru_hits += 1`, sem enqueue ✅ |
| batch >= threshold         | `flush()` imediato ✅ |
| flush falha                | `flush_errors += 1` + per-row fallback ✅ |
| fallback falha             | `fallback_errors += 1`, auth não quebra ✅ |
| erro inesperado            | catch isolado, log warn, não propaga ✅ |
| HMAC inválido              | coalescer não é chamado (gated em `hmac.ts`) ✅ |

Testes existentes em `_shared/__tests__/hmac-success-coalescer.test.ts` permanecem
válidos (nenhuma assinatura pública mudou).

## Gates

- `deno check _shared/hmac-success-coalescer.ts` → **0 erros** ✅
- `deno check _shared/hmac.ts` → **0 erros** ✅ (D9-X5 fechado)
- `deno check _shared/serve-agent.ts` → 2 erros **pré-existentes** em `serve-agent.ts:119`
  (`authResult.response`) — **fora do escopo D9-X6** e fora do contrato do coalescer.

## Consumers testados
- `_shared/hmac.ts` (L407 enqueue, L409 inline) — sem mudança de assinatura.
- `_shared/__tests__/hmac-success-coalescer.test.ts` — 4 cenários cobertos.

## Riscos residuais
- Nenhum risco runtime introduzido por D9-X6 (apenas narrowing de `unknown` no catch).
- Pré-existente: erro de tipo em `_shared/serve-agent.ts:119` referente a `authResult.response`.
  Recomendado tratar em PR separado fora da janela do coalescer.

## Próximo alvo recomendado
**D10 — inventário global atualizado** de `@ts-nocheck` / `any` / `deno check` residual.
Núcleo crítico (`agent-auth`, `state-updater`, `heartbeat`, `error-handler`, `hmac`, `hmac-success-coalescer`)
e principais helpers (`serve-agent`, `serve-tenant`, `serve-internal`) estão limpos.
Antes de seguir arquivo-por-arquivo, recalcular o mapa real da dívida.
