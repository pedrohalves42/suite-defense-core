# PR D2 — Tipagem isolada de `heartbeat/state-updater.ts`

**Data:** 2026-06-24  
**Escopo:** apenas tipagem + contenção de payload. Zero mudança de runtime intencional.

## Arquivos tocados

| Arquivo | Mudança |
| ------- | ------- |
| `supabase/functions/heartbeat/state-updater.ts` | Reescrito com tipos fortes; `any` removido; helper `stripMetadataHash` introduzido |

Nada mais. Sem mexer em `heartbeat/index.ts`, `parser/`, `response-builder`, RPC, schema, HMAC, replay, feature flag, `@ts-nocheck`.

## Tipos introduzidos (locais ao módulo)

```ts
type AgentSnapshot = Pick<
  Database['public']['Tables']['agents']['Row'],
  'version' | 'last_heartbeat'
>

export interface HeartbeatUpdateData extends AgentUpdate {
  last_telemetry_at?: string
  update_timestamp?: string
  _current_agent?: AgentSnapshot | null
}

interface ProcessSample {
  pid: number; name: string; cpu_percent: number;
  memory_mb: number; user: string; command_line?: string
}
```

`HeartbeatUpdateData` é compatível com o que `heartbeat/index.ts` já passa hoje (`AgentUpdate & { last_telemetry_at?, _current_agent? }`), então a chamada existente segue válida sem mudança no caller.

## `stripMetadataHash` — contenção do HOTFIX-AUTH-01

```ts
export function stripMetadataHash<T extends Record<string, unknown>>(
  data: T,
): Omit<T, 'metadata_hash'>
```

- Aplicado **antes** de qualquer dirty-check ou write.
- O payload que alcança o RPC e o fallback MVCC é construído sobre `sanitizedUpdate`, e ainda passa por uma cópia limpa que descarta as chaves de controle (`last_telemetry_at`, `update_timestamp`, `last_heartbeat`, `_current_agent`).
- Tipo de retorno `Omit<T, 'metadata_hash'>`: qualquer código a jusante que tente ler `metadata_hash` no resultado é erro de tipo.
- Agentes podem continuar enviando `metadata_hash` para forward-compat (continua aceito no `OSInfo` do parser e no `AgentUpdate` da interface). **Persistência: bloqueada por construção.**

## Eliminação de `any`

| Antes | Depois |
| ----- | ------ |
| `updateData: AgentUpdate & { _current_agent?: any }` | `HeartbeatUpdateData` com `_current_agent?: AgentSnapshot \| null` |
| `(updateData as any).update_timestamp` / `.version` | campos diretos em `HeartbeatUpdateData` |
| `'metadata_hash' in (updateData as any); delete (updateData as any).metadata_hash` | `sanitizedUpdate = stripMetadataHash(updateData)` (sem mutação do caller) |
| `(currentAgent as any)[k]` | `current[k]` via `Record<string, unknown>` no helper `isMetadataChanged` |
| `p_update_data: updateData as any` | `rpcPayload: Record<string, unknown>` montado sem chaves de controle; RPC client castado uma única vez em ponto isolado e comentado (RPC não está nos tipos gerados) |
| `({ ...updateData, status, ... } as any)` no fallback MVCC | `updatePayload as Database['public']['Tables']['agents']['Update']` |
| `catch (e: any)` no token touch | `catch (e: unknown)` + `instanceof Error` |
| `processAnomalies: any[] \| undefined` | `unknown[] \| undefined` + narrow |
| `const allProcs: any[]` | `ProcessSample[]` |

Resultado: `grep ":\s*any\b\|<any>\|as any\b\|any\[\]" state-updater.ts` → **0 hits**.

Único cast estrutural restante (justificado): `supabase.rpc as unknown as (...)` — o RPC `update_agent_heartbeat_atomic` não está no `Database['public']['Functions']` gerado; o cast é localizado, comentado, e o payload já está sanitizado antes da chamada.

## Comportamento preservado (smoke lógico)

| Caso | Esperado | Validado |
| ---- | -------- | -------- |
| heartbeat normal | `updateData` válido, RPC chamado | ✅ mesma ordem, mesmo payload (sem chaves de controle) |
| payload com `metadata_hash` | campo descartado antes de persistir | ✅ `stripMetadataHash` + `rpcPayload` montado por allowlist |
| `processes` (top_by_cpu/memory) | dedupe por pid, mapeado | ✅ idêntico, tipado como `ProcessSample` |
| `anomalies` | inseridas em `suspicious_processes` | ✅ idêntico, normalizadas a `unknown[]` |
| fallback SELECT (`version, last_heartbeat`) | inalterado | ✅ mesmas colunas, mesmo `maybeSingle()` |
| dirty-check por campo | inalterado | ✅ extraído para `isMetadataChanged`, mesma lógica de objeto-vs-objeto via `JSON.stringify` |
| throttling (`HEARTBEAT_WRITE_THROTTLE_MS = 60_000`, `TELEMETRY_THROTTLE_MS = 300_000`) | inalterado | ✅ |
| fallback MVCC (Optimistic Lock por `version`) | inalterado | ✅ mesmo `+1`, mesmo `.eq('version', currentVersion)`, mesmo tratamento de `P0001` |
| status forçado para `'active'` no fallback | inalterado | ✅ |
| `last_heartbeat = now.toISOString()` no fallback | inalterado | ✅ |
| log de stale / redundância | inalterado | ✅ mesmas mensagens, mesmo nível |
| token touch (fire-and-forget) | inalterado | ✅ |
| inserts em `agent_system_metrics_partitioned` e `agent_processes` | inalterados | ✅ mesmas colunas, mesmos valores |

## Validação

| Gate | Resultado |
| ---- | --------- |
| `bunx tsgo --noEmit` | ✅ 0 erros |
| `bun run lint` | ✅ 0 erros (914 warnings pré-existentes) |
| `bash scripts/bloco-c-gates.sh` | ✅ BLOCO C GATES PASSED |
| `bash ci/security_gate.sh` | ⏭ requer `DATABASE_URL`; roda no CI |

Observação técnica: `supabase/functions/**` está em `exclude` de `tsconfig.json` e em `ignores` de `eslint.config.js` — `tsgo`/lint não checam edge functions diretamente. A tipagem deste PR vale como **contrato interno** que ativa no momento em que `@ts-nocheck` for retirado de qualquer caller (D3).

## Follow-ups registrados

- **D1-FOLLOWUP** (do PR anterior): trocar `AgentExtraField = Exclude<keyof AgentRow, AgentBaseField>` por allowlist explícita de campos seguros — `hmac_secret`, `result_public_key`, `payload_hash` etc. existem em `AgentRow` e hoje são tecnicamente passáveis via `extraAgentFields`. Não bloqueia D2/D3, mas precisa de PR D-FOLLOWUP-01 antes que outros endpoints sejam tipados.
- **D2-FOLLOWUP** (novo): `supabase/functions/heartbeat/types.ts` tem duas chaves de fechamento órfãs (linhas 99–100 — `}` `}` extras após `AgentUpdate`). Isso só não quebra hoje porque o caminho inteiro está com `@ts-nocheck` / fora do typecheck. Antes do D3 essa limpeza precisa entrar como PR isolada (`D-FOLLOWUP-02`).

## Próximo passo

Aguardando merge do D2. Em seguida (com D1+D2 estabilizados): **D3 — remover `@ts-nocheck` de `heartbeat/index.ts`**, condicionado a D-FOLLOWUP-02 (limpeza de `types.ts`) e, idealmente, D-FOLLOWUP-01 (allowlist de `AgentExtraField`).
