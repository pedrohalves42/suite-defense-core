# Bloco D6 — Remove @ts-nocheck de `poll-jobs/index.ts`

## Escopo

Apenas `supabase/functions/poll-jobs/index.ts`.

## Mudanças

- Removido `// @ts-nocheck`.
- `supabase` (vindo de `ctx`) narrowed para `SupabaseClient<Database>` em escopo local. O tipo público de `AgentContext.supabase` permanece `any` para compatibilidade.
- `agentData.agent_version`, `agentData.last_heartbeat`, `agentData.status` lidos via helper `asNullableString(unknown)` em vez de `as string | null`.
- `ctx.hmacSecret || ''` → `?? ''` (sem mudança semântica, `hmac_secret` é `string | null`).
- `AuthenticatedAgent` montado com tipo explícito; defaults preservados (`''`, `null`, `false`).
- Imports removidos: `requireEnv`, `createTypedClient`, `checkRateLimit`, `validateHttpMethod`, `handleCorsPreflightRequest`, `buildCorsHeaders`, `authenticateAndValidateAgent`, `emptyResponse` — não utilizados após a modularização anterior.

## Não mudou

- Seleção / ordem / prioridade / status de jobs.
- Payload entregue ao agente (estrutura, nomes, contrato).
- Auth / HMAC / replay / token hashing.
- RLS / RPC / migrations.
- `auth-handler.ts`, `job-claimer.ts`, `serve-agent.ts`, `agent-auth.ts`.
- `ack-job` e `submit-job-result`.
- Rate limit (`maxRequests: 10`, `windowMinutes: 1`, `blockMinutes: 5`).

## Gates

| Gate | Resultado |
|---|---|
| `tsgo --noEmit` | ✅ 0 erros |
| `bun run lint` | ✅ 0 erros (914 warnings pré-existentes) |
| `scripts/bloco-c-gates.sh` | ✅ PASS (3/3) |
| `ci/security_gate.sh` | ⏳ requer `DATABASE_URL` — delegado ao CI |

## Próximo

**D7 — `ack-job/index.ts`** (sensível: bloqueio de jobs críticos + evidência/auditoria; isolar em PR próprio).
