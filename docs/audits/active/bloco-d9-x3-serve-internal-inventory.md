# Bloco D9-X3 — Inventário de consumers de `_shared/serve-internal.ts`

Data: 2026-06-25  
Escopo: read-only. Mapear consumidores antes de tipar.

## Comando

```bash
rg -n "serveInternal|serve-internal|ServeInternalOptions|InternalContext" supabase/functions
```

## Estado inicial do helper

| Arquivo | `@ts-nocheck` | Observação |
|---|---|---|
| `supabase/functions/_shared/serve-internal.ts` | ❌ não | já estava sem `@ts-nocheck`. Único débito de tipos: `supabase: any` em `InternalContext` e `createClient<any>`. |

`serve-tenant.ts` re-exporta `serveInternal`, `InternalContext` e `InternalHandler` para compatibilidade — vários consumers importam via `'../_shared/serve-tenant.ts'`.

## Consumers de `serveInternal` (9 funções)

| Função | Import path | Tipo | Notas |
|---|---|---|---|
| `check-tenant-abuse` | `serve-internal.ts` (direto) | ops/abuse-detection | cron, lê `tenants` + RPC `get_tenant_abuse_metrics` |
| `upload-release-content` | `serve-tenant.ts` (re-export) | release/build | upload de artefatos para storage |
| `setup-agent-script` | `serve-tenant.ts` | provisioning | gera script de agente |
| `ai-system-analyzer` | `serve-tenant.ts` | ai/ops | analisa estado do sistema |
| `ai-predict-agent-failure` | `serve-tenant.ts` | ai/ops | predição de falhas |
| `ai-insight-dispatcher` | `serve-tenant.ts` | ai/ops | dispara insights |
| `evaluate-playbook-triggers` | `serve-tenant.ts` | automation | avalia gatilhos de playbook |
| `evaluate-automation-rules` | `serve-tenant.ts` | automation | engine v2 de regras |
| `autonomous-safe-mode` | `serve-tenant.ts` | security/ops | safe-mode autônomo |

## Headers/secrets exigidos

Tudo via `assertInternalCaller(req)` sem options. Aceita:
- `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (timing-safe)
- `X-Internal-Secret: <INTERNAL_FUNCTION_SECRET>` (timing-safe)

Anon key foi **removido** previamente (SSA-009) e segue removido.

## Shape do ctx consumido

```ts
interface InternalContext {
  supabase: SupabaseClient<Database>; // antes: any
  requestId: string;
  body: unknown;
}
```

Consumers usam apenas `supabase`, `requestId`, `body`. Nenhum lê campos extras — não há cast destrutivo a preservar.

## Criticidade

| Aspecto | Nível | Motivo |
|---|---|---|
| Autenticação interna | 🔴 alta | service_role + X-Internal-Secret |
| Cross-tenant impact | 🟠 média | endpoints rodam system-wide |
| Blast radius (9 consumers) | 🟢 baixo | ctx não muda de shape |

## Ordem aprovada

- **D9-X3** — `_shared/serve-internal.ts` (este PR).
- **D9-X4** — `_shared/error-handler.ts` (próximo).
- **D9-X5** — `_shared/hmac.ts` residual type cleanup.
