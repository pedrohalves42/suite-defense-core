# Error-handling Hardening — 2026-06-22

## Estado anterior (já existente)

- ✅ `ErrorBoundary` global em `App.tsx` + `RouteErrorBoundary`, `TenantErrorBoundary`, `DashboardErrorBoundary`
- ✅ `Suspense` envolvendo rotas lazy
- ✅ `src/lib/errors.ts` — hierarquia `CyberShieldError` / `NotFoundError` / `ConflictError` / `RateLimitError`
- ✅ `supabase/functions/_shared/error-handler.ts` — `handleException`, `createValidationError`, `createAuthError`, `createNotFoundError` com PII masking em produção e CORS headers
- ✅ `logger.ts` estruturado com correlation context e ring buffer

## Gaps P0/P1 identificados e corrigidos

| ID | Severidade | Gap | Correção |
|----|-----------|-----|----------|
| EH-1 | P0 | `QueryClient` sem `QueryCache.onError` → erros de `useQuery` viravam "loading eterno" ou dados vazios sem feedback ao usuário | `queryCache` global com toast deduplicado por queryKey (janela 5s) + log estruturado |
| EH-2 | P0 | `QueryClient` sem `MutationCache.onError` → mutations falhavam silenciosamente quando o consumidor esquecia o `onError` local | `mutationCache` global com toast + log; respeita `meta.silent` e `meta.handled` para opt-out |
| EH-3 | P1 | `retry: 1` sem filtro → tentava de novo 401/403/404 (auth/permission) gerando spam de requests e mascarando o erro real | `shouldRetry`: pula 4xx, até 2 retries em rede/5xx; `retryDelay` exponencial capado em 30s |
| EH-4 | P1 | Sem `window.onunhandledrejection` → promises rejeitadas fora do React não chegavam ao logger | Listeners `unhandledrejection` + `error` no `main.tsx` enviando para `logger.error` |

## API para consumidores

```ts
// Silenciar (apenas log, sem toast):
useQuery({ queryKey: [...], queryFn, meta: { silent: true } });

// Mensagem custom:
useQuery({ queryKey: [...], queryFn, meta: { errorMessage: "Falha ao carregar agentes" } });

// Mutation com onError próprio (evita toast duplicado):
useMutation({ mutationFn, meta: { handled: true }, onError: (e) => { /* tratamento custom */ } });
```

## Não tocado (intencional)

- **Edge functions**: infra de `_shared/error-handler.ts` já cobre os 4 requisitos (try/catch padrão via `handleException`, mapping para status, log sem PII em prod, CORS em todas as respostas). Sem gap P0/P1.
- **Hooks individuais**: o handler global cobre todos os `useQuery`/`useMutation` sem refactor — opt-out via `meta`. Nenhuma migração de tela necessária nesta rodada.
- **AbortSignal**: já presente em `_shared/fetch-with-timeout.ts` e nos hooks que fazem fetch direto.

## Arquivos alterados

- **Criado**: `src/lib/query-error-handlers.ts`
- **Editado**: `src/main.tsx` (wiring + handlers de window)
- **Criado**: `docs/audits/2026-06-22-error-handling-hardening.md` (este)

## Validação

- `tsc --noEmit` ✅ limpo
- Comportamento esperado: qualquer falha em query/mutation agora gera toast (deduplicado) e entry no logger; 401 não toasta (já tratado pelo `AuthProvider`); 4xx não fazem retry.
