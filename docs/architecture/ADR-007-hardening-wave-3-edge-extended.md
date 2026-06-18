# ADR-007 — Hardening Wave 3 (estendida): heartbeat, submit-job-result, scim-provisioning, ai-action-executor

**Status:** Implemented
**Date:** 2026-06-18
**Predecessor:** ADR-006 (Wave 3 parcial — `_shared/dlq.ts`, `_shared/validate-caller-tenant.ts`, `execute-playbook-action`)

## Escopo
Auditoria por feature crítica das 4 functions com maior superfície de risco operacional e de segurança:
`heartbeat/`, `submit-job-result/`, `scim-provisioning/`, `ai-action-executor/`.

## Bugs corrigidos

### B27 — `submit-job-result/security.ts` vazava CORS estático em duas respostas (P1)
**Problema:** `PAYLOAD_TAMPERED` (409) e a resposta de submissão duplicada (200) usavam o objeto importado `corsHeaders` (`*`) em vez de `buildCorsHeaders(ctx.origin)`. Para tenants com origem específica, navegador rejeita a resposta — agente vê erro CORS no lugar do código real, escondendo tampering legítimo.
**Solução:** Trocar para `buildCorsHeaders(ctx.origin)` em ambas as respostas, alinhado às demais saídas do módulo.

### B28 — `submit-job-result/index.ts` acessava `.message` em `unknown` (P2)
**Problema:** `catch (sideEffectError) { ... sideEffectError.message ... }` — `unknown` em TS estrito; com `@ts-nocheck` o erro fica oculto, mas em runtime, se um `throw 'string'` borbulhar de side-effect, `.message` é `undefined` e os logs perdem a causa.
**Solução:** Normalizar via `instanceof Error ? .message : String(...)` antes de logar e devolver no payload.

### B29 — `submit-job-result/post-completion.ts` quebrava `validateUpdateAgentVersion` quando o agente sumia (P2)
**Problema:** `select('agent_version').eq('id', agent.id).single()` lança se o agente foi removido entre o submit e o validate (cenário real durante decommission). A exceção subia para o handler genérico, devolvendo 500 mesmo após o job já ter sido marcado como completed — falso negativo no monitor.
**Solução:** `.maybeSingle()` + fallback para `''` (já presente via `?? ''`).

### B30 — `heartbeat/state-updater.ts` duas leituras `.single()` em hot path (P2)
**Problema:** Os fetches de `metadata_hash`/`version` e do fallback MVCC usavam `.single()`. Em janelas raras (agente recém-deletado, RLS bloqueando temporariamente), o heartbeat morria com 500 e o agente entrava em loop de retry — amplificando carga.
**Solução:** Substituir as duas chamadas por `.maybeSingle()`; o código adiante já trata `currentAgent` nulo.

### B31 — `scim-provisioning/user-handlers.ts::listUsers` reportava `totalResults` errado (P1)
**Problema:** `totalResults: resources.length` retornava apenas o tamanho da página atual. Conectores SCIM (Okta, Azure AD, Google) usam `totalResults` para decidir paginação — com valor truncado, **paravam de paginar após a primeira página**, deixando usuários sem provisionar.
**Solução:** Adicionar `count: 'exact'` na query de `user_roles` e devolver o total real; quando `filter` está presente, manter `resources.length` (filtragem in-memory pós-paginação não suporta total preciso).

### B32 — `ai-action-executor/index.ts` usava `.single()` no fetch da action (P2)
**Problema:** Se `action_id` não existir (race com delete) ou for de outro tenant filtrado por RLS, `.single()` lança erro genérico de DB em vez do `throw new Error('Action not found')` logo abaixo. A guarda `if (actionError || !action)` é dead-code com `.single()`.
**Solução:** Mudar para `.maybeSingle()`; o guarda existente passa a funcionar e retorna mensagem semântica.

## Não corrigidos (registrados para próxima onda)

- `ai-action-executor/handlers.ts`: 9 `.insert().select().maybeSingle()` que deveriam ser `.single()` (inserts sempre retornam 1 linha). Risco baixo — `job?.id` apenas vira `undefined` em falha silenciosa.
- `scim-provisioning/user-handlers.ts::createUser`: `listUsers({ perPage: 1000 })` global limita lookup a 1000 usuários — re-implementar via query direta em `auth.users` é tarefa dedicada.
- `submit-job-result/execution.ts::verifySignature`: branch `if (!result_signature)` tem dead-code (`result_signature === null && execution_id && nonce`) — cosmético.
- `heartbeat/parser/heartbeat-parser.ts::buildAgentUpdate`: a normalização de `state` aceita strings desconhecidas como `'warning'` — comportamento intencional conforme comentário, mas merece teste dedicado.

## Verificação

- `bash -n` não aplica (TS); revisão estática manual + grep por `corsHeaders` confirmando ausência do import estático nas respostas de erro restantes.
- Contratos públicos das 4 functions inalterados (mesmas chaves de resposta, mesmos códigos HTTP por cenário esperado).
- Trace IDs preservados em todos os pontos de log adicionados/alterados.

## Próxima onda sugerida

**Wave 4 — Frontend:** error boundaries em rotas críticas (`ProtectedAppRoutes`, `AdminRoutes`), `useQuery` com tratamento explícito de erro, `AbortController` em hooks longos (`useAgentTelemetry`, `useDashboardLive`), cleanup de listeners realtime em `useEffect`.
