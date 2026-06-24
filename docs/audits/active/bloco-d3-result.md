# Bloco D3 — Remoção de `@ts-nocheck` de `heartbeat/index.ts`

## Status
✅ Concluído

## Escopo
- Removido `// @ts-nocheck` de `supabase/functions/heartbeat/index.ts`.
- Tipagem alinhada a D1 (`AgentExtraField` allowlist) e D2 (`HeartbeatUpdateData`, `stripMetadataHash`).
- Pequena extensão em `heartbeat/types.ts`: campo opcional `agent_state` adicionado a `AgentContext` (já era populado em runtime e consumido pelo parser para dirty-check).

## Mudanças técnicas
1. **`@ts-nocheck` removido** do orquestrador do heartbeat.
2. **`HEARTBEAT_EXTRA_FIELDS`** agora tipado como
   `as const satisfies ReadonlyArray<AgentExtraField>`.
   - `'status'` removido do array (já está em `AgentBaseField` no agent-auth, era redundante e fora da allowlist segura).
   - Qualquer campo fora da allowlist da D-FOLLOWUP-01 (ou inexistente em `agents`) passa a falhar typecheck.
3. **Eliminação de `as any`** nos pontos onde mutamos o payload de update:
   - `updateData` é declarado como `HeartbeatUpdateData` (extends `AgentUpdate`).
   - `last_telemetry_at`, `update_timestamp`, `_current_agent` agora são propriedades tipadas.
   - `_current_agent` é construído explicitamente com o shape `AgentSnapshot` (`version`, `last_heartbeat`).
4. **Narrowing seguro** para `agentData: Record<string, unknown>`:
   - Helpers locais `asNullableString`, `asBoolean`, `asNullableBoolean`, `asNumber` substituem casts diretos `as string | null` etc.
   - Sem `unknown as X` em campos sensíveis.
5. **Erros de runtime intocados**: lógica de HMAC, autenticação, replay protection, force-update, parser, state-updater, response-builder, feature flags e RPCs **não foram modificados**.

## Arquivos tocados
- `supabase/functions/heartbeat/index.ts` (reescrito sem `@ts-nocheck`, mesma lógica)
- `supabase/functions/heartbeat/types.ts` (+1 linha: `agent_state?: string` em `AgentContext`)

## Não tocados (proibido por escopo)
- `supabase/functions/_shared/agent-auth.ts`
- `supabase/functions/_shared/serve-agent.ts`
- `supabase/functions/_shared/hmac.ts`
- `supabase/functions/heartbeat/state-updater.ts`
- `supabase/functions/heartbeat/parser/heartbeat-parser.ts`
- `supabase/functions/heartbeat/response-builder.ts`
- `supabase/functions/heartbeat/force-update.ts`
- Schemas, RPCs, RLS, feature flags

## Gates
| Gate | Resultado |
|------|----------:|
| `tsgo --noEmit` | ✅ 0 erros |
| `bun run lint`  | ✅ 0 erros (914 warnings preexistentes) |
| `scripts/bloco-c-gates.sh` | ✅ PASS (3/3) |

## Invariantes preservadas
| Caso | Esperado | Status |
|------|----------|-------:|
| Token válido + HMAC válido | 200 OK | sem mudança de runtime |
| Token inativo / inexistente | 401 | inalterado (serveAgent) |
| HMAC inválido | `AUTH_INVALID_SIGNATURE` | inalterado |
| Replay | `AUTH_REPLAY_DETECTED` | inalterado |
| `metadata_hash` no payload | não persiste | reforçado por `HeartbeatUpdateData`/`stripMetadataHash` |
| `last_heartbeat` | atualiza | inalterado |
| telemetria | insere | inalterado |
| force-update | continua funcionando | inalterado |

## Regressões bloqueadas em typecheck
- Re-introduzir `'metadata_hash'` ou outro campo sensível em `HEARTBEAT_EXTRA_FIELDS` → typecheck falha (não está em `AgentExtraField`).
- Re-introduzir `'status'` no array de extras → typecheck falha.
- Setar `updateData.metadata_hash` no orquestrador → propagado/anulado por `stripMetadataHash` na escrita (D2).
- Acessar `agentData.<campo>` assumindo string sem narrowing → eliminado via helpers.

## Próximos passos sugeridos
- Considerar remover `@ts-nocheck` de `supabase/functions/_shared/serve-agent.ts` em PR isolada (não estava no escopo do D3).
