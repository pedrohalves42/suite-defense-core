# PR D1 — Tipagem isolada de `_shared/agent-auth.ts`

**Data:** 2026-06-24  
**Escopo:** apenas tipagem. Zero mudança de runtime intencional.

## Arquivos tocados

| Arquivo | Mudança |
| ------- | ------- |
| `supabase/functions/_shared/agent-auth.ts` | Reescrito com tipos fortes; `any` removido |
| `supabase/functions/_shared/serve-agent.ts` | 2 linhas: `extraAgentFields` agora é `ReadonlyArray<AgentExtraField>` |

Nada mais. Sem migration, sem RPC, sem RLS, sem feature flag, sem HMAC.

## Tipos introduzidos

```ts
type AgentRow        = Database['public']['Tables']['agents']['Row'];
type AgentBaseField  = 'id'|'agent_name'|'tenant_id'|'hmac_secret'|'honeypot_mode'|'status';
export type AgentExtraField = Exclude<keyof AgentRow, AgentBaseField>;

type EmbeddedAgent = Pick<AgentRow, AgentBaseField> & Partial<AgentRow>;
interface TokenWithAgent { agent_id: string; expires_at: string|null;
                           agents: EmbeddedAgent | EmbeddedAgent[] }
interface AnyTokenRow    { agent_id: string|null; is_active: boolean|null;
                           expires_at: string|null }
interface PostgrestLikeResponse { error: { message?: string } | null }
```

## Eliminação de `any`

| Antes (linhas no arquivo antigo) | Depois |
| -------------------------------- | ------ |
| `supabase: any` (L49, L93)       | `SupabaseClient<Database>` |
| `(res: any) => …` (L74)          | `(res: PostgrestLikeResponse) => …` |
| `(e: any) => …` (L79, L87)       | `(e: unknown) => …` + `instanceof Error` |
| `(anyTok as any).agent_id/is_active` (L164–165) | cast único `as AnyTokenRow \| null` |
| `(token.agents as any)` (L189, 205) | `unwrapEmbeddedAgent(EmbeddedAgent\|EmbeddedAgent[])` |
| `(agent as any).id/tenant_id/agent_name` (L212–214) | acesso direto via `EmbeddedAgent` |

`any` residual: **um único cast localizado** em `agentObj as Record<string, unknown>` para o `rest`-destructure que produz `extraData`. Justificado por: o conjunto de extra fields é dinâmico (definido por cada caller) e por isso `extraData` é intrinsecamente `Record<string, unknown>`. Não há `any`.

## Guarda `metadata_hash` (peça-chave do D1)

Antes: `extraAgentFields?: string[]` — qualquer string passava, inclusive `'metadata_hash'` (coluna inexistente que produziu 401 silencioso na semana retrasada — HOTFIX-AUTH-01).

Agora:

```ts
extraAgentFields?: ReadonlyArray<AgentExtraField>
// AgentExtraField = Exclude<keyof AgentRow, AgentBaseField>
```

Qualquer caller em arquivo **sem `@ts-nocheck`** que tente:

```ts
extraAgentFields: ['metadata_hash']
//                  ^^^^^^^^^^^^^^^
// Type '"metadata_hash"' is not assignable to type 'AgentExtraField'.
```

falha em `tsgo --noEmit` antes de chegar no PostgREST.

**Estado atual da guarda:**
- 100% dos callers de `serveAgent` ainda têm `@ts-nocheck` (incluindo `heartbeat/index.ts`, `submit-hmac-router`, etc.). A guarda existe no tipo mas fica dormente nesses arquivos.
- A guarda **ativa automaticamente** assim que `@ts-nocheck` for removido de qualquer caller — ou seja, exatamente quando D3 retirar a diretiva de `heartbeat/index.ts`. É o efeito desejado pelo sequenciamento.
- `authenticateAgent` direto: nenhum caller hoje além de `serve-agent.ts` (que tem `@ts-nocheck`). Qualquer novo caller direto em arquivo tipado já é coberto.

## Comportamento preservado

| Caminho | Comportamento |
| ------- | ------------- |
| Token ausente                          | 401 `missing_token_header` (idêntico) |
| Token formato JWT                      | 401 `jwt_token_rejected` (idêntico) |
| Token desconhecido / inativo           | 401 `invalid_or_inactive_token` (idêntico) — inclui o fallback de resolução `anyTok` |
| Token expirado (+60s leeway)           | 401 `TOKEN_EXPIRED` (idêntico) |
| Agente `retired/blocked/suspended`     | 403 `AGENT_BLOCKED` (idêntico) |
| Agente válido                          | `{ success: true, agent, agentData }` (idêntico) |
| `recordTokenFailure` fire-and-forget   | mesma chamada, mesmos campos, `EdgeRuntime.waitUntil` quando disponível |
| Ordem de checagens (token → JWT-reject → hash lookup → expiração → status) | preservada |
| Headers/CORS/status code               | inalterados |

`metadata_hash`: continua **fora** do select. Não é base, não é extra, e agora é estruturalmente impossível de adicionar via tipos.

## Validação

| Gate | Resultado |
| ---- | --------- |
| `bunx tsgo --noEmit`        | ✅ 0 erros |
| `bun run lint`              | ✅ 0 erros (914 warnings pré-existentes) |
| `bash scripts/bloco-c-gates.sh` | ✅ BLOCO C GATES PASSED |
| `bash scripts/bloco-b-lint.sql` | ✅ BLOCO B LINT PASSED (rodado antes do D1; nenhuma migration aqui) |
| `bash ci/security_gate.sh`  | ⏭ requer `DATABASE_URL`; roda no CI |

Smoke lógico (esperado vs validado por inspeção dos call-sites e do tipo):

| Caso                                     | Resultado esperado     | Validado |
| ---------------------------------------- | ---------------------- | -------- |
| token válido                             | autentica              | ✅ caminho inalterado |
| token inativo                            | 401 correto            | ✅ caminho inalterado |
| token inexistente                        | 401 correto            | ✅ caminho inalterado |
| agente embutido presente                 | `AgentContext` válido  | ✅ `unwrapEmbeddedAgent` cobre objeto e array |
| `extraAgentFields` com campo inexistente | bloqueado em typecheck | ✅ via `AgentExtraField` (ativa quando `@ts-nocheck` sair) |
| `metadata_hash`                          | não volta              | ✅ não está no select; estruturalmente bloqueado |

## Próximo passo

Aguardando merge do D1. Em seguida: **D2 — tipagem isolada de `heartbeat/state-updater.ts`** (plano em `bloco-d0-inventario.md`). Só após D2 estabilizar é que se abre D3 (remoção do `@ts-nocheck` de `heartbeat/index.ts`).
