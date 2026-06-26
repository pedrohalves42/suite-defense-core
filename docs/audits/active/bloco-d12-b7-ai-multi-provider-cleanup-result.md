# Bloco D12-B7 — `ai-multi-provider.ts` cleanup result

**Status:** ✅ Concluído
**Escopo:** remoção da diretiva `@ts-nocheck` em `supabase/functions/_shared/ai-multi-provider.ts`.

## Arquivo alterado

| Arquivo | Mudança |
| --- | --- |
| `supabase/functions/_shared/ai-multi-provider.ts` | Removida diretiva `// @ts-nocheck`. Ajustes type-only mínimos em `persistAIMetricsWithProvider`: assinatura do `global.fetch` alinhada a `(input: RequestInfo \| URL, init?: RequestInit)` (mesma forma adotada em `_shared/supabase-client.ts`) e o `insert(...)` recebeu `as never` para satisfazer o overload do client tipado com `Database` genérica `any` (mantendo o payload, colunas e ordem inalterados). |

## Diretivas removidas

1 diretiva ativa.

## Erros encontrados durante a remoção

`deno check` apontou 2 erros, ambos type-only:

1. **TS2322** — incompatibilidade da assinatura do `global.fetch` (`(url: string, options: any)` vs. overloads do client).
2. **TS2769** — overload do `insert` reclamando das chaves do literal (resolução do schema `any`).

Ambos resolvidos com mudanças type-only (assinatura do fetch + `as never` no payload). Nenhuma anotação adicional foi necessária.

## Runtime preservado (auditoria item a item)

- **`callGoogleGemini` / `callOpenAICompatible` / `callProvider`**: corpo, headers, `timeoutMs: TIMEOUT_TIERS.AI`, parsing de resposta e extração de tokens — inalterados.
- **`persistAIMetricsWithProvider`**:
  - Cliente `service_role` continua sendo criado por chamada com timeout de 5s no fetch.
  - Tabela alvo `ai_inference_metrics` — inalterada.
  - Colunas e ordem do `insert`: `function_name, model, provider, latency_ms, success, tokens_total, tokens_prompt, tokens_completion, tenant_id, used_fallback, cost_usd, error, created_at` — inalteradas.
  - Coerção `|| null` e `|| 0` — inalteradas.
  - `try/catch` com `logger.warn('[AI Metrics] Failed to persist:', err)` — inalterado.
- **`aiComplete`**:
  - Lookup de cache (`AICacheUseCase` + `SupabaseAICacheAdapter`) — inalterado.
  - Cache HIT continua persistindo métricas com `tokens_total: 0`, `used_fallback: false`, `cost_usd: 0` e retornando `latencyMs` calculado — inalterado.
  - Loop de failover (`selectSmartProvider` → `getAvailableProviders().sort(score)`) — inalterado.
  - `recordProviderSuccess / Failure`, `recordStatsSuccess / Failure` — inalterados.
  - Cálculo de custo `(tokensUsed / 1_000_000) * provider.costPerMToken` — inalterado.
  - Cache `store(...)` best-effort com `.catch(logger.warn)` — inalterado.
  - Fallback final retornando `provider: 'lovable'`, `model: 'none'`, `usedFallback: true` e mensagem `All AI providers failed. Last error: …` — inalterado.
- **Helpers exportados** (`getProviderStatus`, `resetProviderCircuit`, `getActiveProviders`, `getProviderScores`, `aiSimpleComplete`, `aiJsonComplete`) — assinaturas e retornos inalterados; regex de extração de JSON (` ```json ` e `\{[\s\S]*\}`) preservada.
- **Re-exports** (`AIProviderName`, `AIProviderConfig`, `AIMessage`, `AICompletionRequest`, `AICompletionResponse`, `setScoreBasedRouting`) — inalterados.
- **Logs**: mesmas mensagens (`[AI Router] Trying …`, `[AI Router] Cache HIT …`, `[AI Router] Cache lookup failed:`, `[AI Router] Cache store failed:`, `[AI Router] … failed: …`, `[multi-provider] …`). Nenhum segredo, API key, header de autorização ou payload sensível adicional foi exposto.

## Consumers validados

`rg` localizou 6 consumers reais (além de re-exports internos):

```
supabase/functions/api-gateway/handlers/translate-cve.ts
supabase/functions/ai-router/handlers/provider-status.ts
supabase/functions/_shared/ai-provider-configs.ts
supabase/functions/_shared/ai-provider-routing.ts
supabase/functions/_shared/ai-provider-helper.ts
supabase/functions/_shared/hexagonal/smart-router-use-case.ts
supabase/functions/_shared/hexagonal/smart-router-port.ts
supabase/functions/_shared/hexagonal/smart-router-adapter.ts
```

`deno check` nos consumers de runtime (excluindo arquivos que apenas re-exportam tipos):

```
deno check supabase/functions/_shared/ai-multi-provider.ts                       → OK
deno check supabase/functions/api-gateway/handlers/translate-cve.ts              → OK
deno check supabase/functions/ai-router/handlers/provider-status.ts              → OK
deno check supabase/functions/_shared/ai-provider-helper.ts                      → OK
deno check supabase/functions/_shared/hexagonal/smart-router-use-case.ts         → OK
deno check supabase/functions/_shared/hexagonal/smart-router-adapter.ts          → OK
```

Nenhum consumer precisou ser alterado.

## Gate expandido

`scripts/guard-no-ts-nocheck-tier1.sh` agora protege +1 path:

```
supabase/functions/_shared/ai-multi-provider.ts
```

Total protegido: **35 arquivos**. Execução:

```
bash scripts/guard-no-ts-nocheck-tier1.sh
PASS: no active @ts-nocheck in protected Tier 1 / type-clean files.
EXIT=0
```

## Diretivas `_shared` restantes (1)

```
supabase/functions/_shared/domain-events.ts
```

Bate com o esperado pelo veredito.

## Próximo alvo

**D12-B8 — `supabase/functions/_shared/domain-events.ts`** (Onda 3 — fix necessário: `TS2769` em `new Date(row.occurred_on)`).
