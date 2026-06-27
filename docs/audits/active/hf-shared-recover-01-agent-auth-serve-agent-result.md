# HF-SHARED-RECOVER-01 — `_shared/agent-auth.ts` + `_shared/serve-agent.ts` recovery

Data: 2026-06-27
Escopo: type-only — sem mudanças de runtime, HMAC, replay, token validation, status codes, logging, contexto ou consumers.

## Erros corrigidos

| Arquivo | Linha | Código | Mensagem |
|---|---:|---|---|
| `_shared/agent-auth.ts` | 255 | TS2352 | Conversion of type `GenericStringError` to type `TokenWithAgent` may be a mistake |
| `_shared/serve-agent.ts` | 119 | TS2339 | Property `response` does not exist on type `AgentAuthResult` |

## Causa provável

1. **`agent-auth.ts:255`** — O `select` do PostgREST é construído a partir da string runtime `agentSelectColumns`. O parser de tipos do `@supabase/postgrest-js` não consegue inferir o embed `agents!inner(...)` quando as colunas vêm de uma variável dinâmica, e cai no fallback `GenericStringError`. O cast direto `as TokenWithAgent` viola a regra de "sufficient overlap" do TS.
2. **`serve-agent.ts:119`** — A discriminated union já estava correta em `AgentAuthResult` (`success: true | false` literais). Porém, no Deno checker, a inferência via `await import('./agent-auth.ts')` (dinâmico) combinada com `if (!authResult.success)` falhou em estreitar para o ramo `{ success: false; response }`. O type guard `===` literal força o narrowing corretamente.

## Arquivos alterados

```
supabase/functions/_shared/agent-auth.ts   (1 hunk — cast localizado via `unknown`)
supabase/functions/_shared/serve-agent.ts  (2 hunks — type import + narrowing explícito)
```

### `agent-auth.ts:255`
- `const token = tokenRaw as TokenWithAgent | null;` →
  `const token = (tokenRaw as unknown) as TokenWithAgent | null;`
- Cast único, localizado, comentado. Sem propagação para outros pontos.

### `serve-agent.ts`
- `import type { AgentExtraField } from './agent-auth.ts'` →
  `import type { AgentExtraField, AgentAuthResult } from './agent-auth.ts'`
- Anotação explícita: `const authResult: AgentAuthResult = await authenticateAgent(...)`.
- `if (!authResult.success)` → `if (authResult.success === false)` — equivalente em runtime, narrowing confiável.

## Runtime preservado

- Mesma query `agent_tokens.select('agent_id, expires_at, agents!inner(...)')`.
- Mesmo `hashToken` + `maybeSingle`.
- Mesma normalização `unwrapEmbeddedAgent` (object/array do PostgREST).
- Mesma cadeia de validação: token presente → não-JWT → ativo → não expirado → agent não bloqueado.
- Mesmos `recordTokenFailure` em todos os caminhos de 401/403.
- Mesmo shape do `AgentContext` no `serve-agent`.
- Mesmo JWT cross-auth gate (403 "User JWT not allowed on agent endpoints").
- Mesmo honeypot gate, HMAC verify, rate limit, parse de body.

## HMAC / replay / token validation

Intocados. `verifyHmacSignature`, `recordTokenFailure`, `AgentExtraField` allowlist (D1), `TOKEN_EXPIRED`, `AGENT_BLOCKED` — todos preservados byte-a-byte.

## Consumers testados

```
deno check supabase/functions/_shared/agent-auth.ts   ✅
deno check supabase/functions/_shared/serve-agent.ts  ✅
deno check supabase/functions/heartbeat/index.ts       ✅ (sem erros próprios)
deno check supabase/functions/poll-jobs/index.ts       ✅ (sem erros próprios)
deno check supabase/functions/ack-job/index.ts         ⚠️ 2× TS2554 (logger arity — pré-existente)
deno check supabase/functions/submit-job-result/index.ts ⚠️ 1× TS2339 (mesma narrowing — pré-existente, ver follow-up)
deno check supabase/functions/serve-dns-filter/index.ts  ⚠️ TS2589/TS2769/TS2345 (`dns_filter_policies` ausente de Database — pré-existente)
```

Nenhum erro novo introduzido. Todos os erros remanescentes são pré-existentes e fora do escopo HF.

## Gates

```
bash scripts/guard-no-ts-nocheck-tier1.sh  → PASS (39 arquivos protegidos)
```

## Riscos residuais e follow-ups

| ID | Descrição | Severidade |
|---|---|---:|
| **HF-FOLLOWUP-NARROW-01** | `submit-job-result/index.ts:64` repete o mesmo padrão de narrowing falho (`if (!validation.success) return validation.response`) em outra union. Aplicar o mesmo fix `=== false`. | baixa |
| **HF-FOLLOWUP-LOGGER-01** | `ack-job/index.ts:69,177` chama `logger.info(msg, a, b, c)` com 4 args (assinatura 1–3). Pré-existente. | baixa |
| **TYPEGEN-SYNC-01** | Tabela `dns_filter_policies` ausente de `database.types.ts`. Já no backlog. | média |
| **BILLING-AUDIT-01** | (mantido separado) ausência de audit log em handlers sensíveis de billing. | alta |
| **HANDLER-CONTEXT-TYPE-01** | (mantido separado) `SB = any` em `billing.ts` / `HandlerContext`. | média |

## Próximo alvo

**D14-A2 — auth/identity** (grafo de `_shared/` limpo, narrowing confiável, gate verde).
