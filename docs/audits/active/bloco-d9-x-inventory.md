# Bloco D9-X — Inventário de dependências dos helpers `_shared/serve-*`

Data: 2026-06-25  
Escopo: read-only. Mapear consumidores de `serveAgent` / `serveTenant` antes de remover `@ts-nocheck`.

## Comando executado

```bash
rg -n "serveAgent|serve-agent|serveTenant|serve-tenant|ServeAgentOptions|ServeTenantOptions" supabase/functions
```

## Helpers alvo

| Arquivo | `@ts-nocheck` | Exporta |
|---|---|---|
| `supabase/functions/_shared/serve-agent.ts` | ✅ sim | `serveAgent`, `AgentContext`, `AgentHandler`, `ServeAgentOptions` |
| `supabase/functions/_shared/serve-tenant.ts` | ✅ sim | `serveTenant`, `TenantContext`, `RateLimitOption`, `ServeOptions` + re-exports |

Re-exports de `serve-tenant.ts`: `servePublic`, `serveAgent`, `serveInternal` e seus tipos. Vários consumers importam `serveAgent` via `'../_shared/serve-tenant.ts'` (compatibilidade); apenas `poll-jobs` já importa direto de `'../_shared/serve-agent.ts'`.

## Consumers de `serveAgent` (11 funções)

| Função | Import path | hmacVerify | extraAgentFields | rateLimit |
|---|---|---|---|---|
| `poll-jobs` | `serve-agent.ts` (direto) | — | — | sim |
| `submit-router` | `serve-tenant.ts` | — | — | — |
| `upload-report` | `serve-tenant.ts` | sim | — | — |
| `post-installation-telemetry` | `serve-tenant.ts` | sim | — | — |
| `update-baseline` | `serve-tenant.ts` | sim | — | — |
| `get-blocked-websites` | `serve-tenant.ts` | sim | `['status']` | — |
| `serve-agent-update` | `serve-tenant.ts` | (best-effort via hmac.ts) | — | — |
| `diagnostics-agent-logs` | `serve-tenant.ts` | — | — | — |
| `get-agent-policy` | `serve-tenant.ts` | — | — | — |
| `check-agent-updates` | `serve-tenant.ts` | sim | — | — |
| `get-agent-config` | `serve-tenant.ts` | — | — | — |

Forma de callback consumida: `async (req|_req, ctx) => Response | objeto`. Campos lidos em `ctx`: `supabase`, `agentId`, `agentName`, `tenantId`, `hmacSecret`, `agentData`, `requestId`, `body`, `rawBody`, `req`.

## Consumers de `serveTenant` (> 30 funções)

Inclui (não exaustivo): `validate-build-pipeline`, `get-agent-script-content`, `sign-release`, `create-reinstall-jobs`, `auto-generate-enrollment`, `generate-portable-installer`, `create-checkout`, `soc2-evidence-collector`, `ai-router`, `generate-deploy-package`, `build-agent-exe`, `evaluate-automation-rules` (`serveInternal`), `upload-release-content` (`serveInternal`), `ai-system-analyzer` (`serveInternal`), `setup-agent-script` (`serveInternal`), etc. `ai-router/types.ts` importa `TenantContext` como tipo.

## Tipos/options usados

- `ServeAgentOptions { extraAgentFields?: ReadonlyArray<AgentExtraField>; hmacVerify?: boolean; rateLimit?: RateLimitOption }`
- `AgentContext` — usado implicitamente (ctx inferido) por todos os consumers.
- `RateLimitOption` re-exportado, usado por `poll-jobs` e outros.
- `ServeOptions` — usado por consumers de `serveTenant`.
- `AgentExtraField` allowlist (D1) preserva a proteção contra `metadata_hash`-style.

## Criticidade

| Helper | Criticidade | Justificativa |
|---|---|---|
| `serve-agent.ts` | 🔴 alta | toca HMAC, replay (via `hmac.ts`), token, honeypot, `extraAgentFields`, rate limit |
| `serve-tenant.ts` | 🟠 média-alta | toca JWT, cross-auth (agent token bloqueado), tenant binding, timeout |

## Ordem aprovada

1. **D9-X1** — `_shared/serve-agent.ts` (mais sensível, menor blast radius por consumidores tipicamente já tipados).
2. **D9-X2** — `_shared/serve-tenant.ts` (maior fan-out; aguarda confirmação de X1).

## Riscos identificados antes do X1

- `AgentContext.supabase: any` é lido por **muitos** consumers; trocar para `SupabaseClient<Database>` precisa ser feito sem quebrar narrowings locais (D1/D2/D3 já fizeram cast local).
- `authResult.agentData` é `Record<string, unknown>`; deve permanecer assim para compat.
- `AgentHandler` retorna `Response | objeto`; consumers retornam ambos. Tipo deve aceitar `unknown`.
- `extraAgentFields` precisa continuar `ReadonlyArray<AgentExtraField>` (sem afrouxar para `string[]`).
