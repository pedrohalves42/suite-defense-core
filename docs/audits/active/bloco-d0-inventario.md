# Bloco D0 — Inventário read-only (type safety)

**Data:** 2026-06-24  
**Escopo:** mapeamento de `@ts-nocheck` e `any` nos arquivos críticos da rota de agente. **Sem alterações de código.**

## Gates pré-bloco (estado atual)

| Gate                  | Resultado |
| --------------------- | --------- |
| `tsgo --noEmit`       | ✅ pass (0 erros) |
| `bun run lint`        | ✅ 0 erros (914 warnings pré-existentes) |
| `scripts/bloco-c-gates.sh` | ✅ PASS (3 gates) |
| `scripts/bloco-b-lint.sql` | ✅ BLOCO B LINT PASSED |
| `ci/security_gate.sh` | ⏭ skip local (`DATABASE_URL` ausente; roda em CI) |

Correção lateral aplicada: removida diretiva `// eslint-disable-next-line react/no-danger` em `src/components/landing/SEO.tsx` (regra inexistente no flat config → único erro de lint). Substituída por comentário explicativo. Sem mudança comportamental.

## Universo `@ts-nocheck` em `supabase/functions`

- **122 arquivos** marcam `@ts-nocheck` (lista completa via `rg -l "@ts-nocheck" supabase/functions`).
- A varredura confirma que `@ts-nocheck` é o padrão dominante no `supabase/functions/`, herdado da migração hexagonal. Remoção em massa está fora de escopo.

## Foco D0 — arquivos críticos do caminho do agente

| Arquivo | Linhas | `@ts-nocheck` | Hits de `any` | Status |
| ------- | -----: | :-----------: | ------------: | ------ |
| `supabase/functions/_shared/agent-auth.ts`         | 240 | **0** | 11 | sem `@ts-nocheck`, mas `any` espalhado |
| `supabase/functions/heartbeat/state-updater.ts`    | 266 | **0** | 12 | sem `@ts-nocheck`, mas `any` espalhado |
| `supabase/functions/heartbeat/parser/heartbeat-parser.ts` | 136 | 0 | 1  | quase limpo (1 cast tolerado em catch) |
| `supabase/functions/heartbeat/index.ts`            | 204 | **1** | 3  | **manter `@ts-nocheck` por enquanto** (orquestrador) |
| `supabase/functions/poll-jobs/index.ts`            | — | 1 | — | fora do escopo D0 (próximo bloco) |

## Diagnóstico — `_shared/agent-auth.ts`

`any`/casts identificados (linhas aproximadas):
- L49 `supabase: any` — parâmetro de `recordTokenFailure`.
- L74 `.then((res: any) => …)` / L79 `.catch((e: any) => …)` — handlers da promise de auditoria.
- L93 `supabase: any` — parâmetro de `authenticateAgent` (entrada principal).
- L164–165 `(anyTok as any).agent_id`, `(anyTok as any).is_active` — fallback de resolução de token.
- L189 `Array.isArray(token.agents) ? (token.agents as any)[0] : (token.agents as any)` — desambiguação do shape `agents!inner`.
- L212–214 `(agent as any).id`, `(agent as any).tenant_id`, `(agent as any).agent_name` — leitura defensiva.

**Plano D1 (não executar agora):**
1. Trocar `supabase: any` por `SupabaseClient<Database>` (já há `import type { SupabaseClient }`, basta importar `Database`).
2. Criar interface local `TokenWithAgent` para o resultado do `select` em `agent_tokens`, eliminando `(anyTok as any)` e `(token.agents as any)`.
3. Tipar callbacks Postgrest com `PostgrestSingleResponse<…>` ou `{ error: PostgrestError | null }` para `.then/.catch`.
4. Manter `recordTokenFailure` como `(...) => void` fire-and-forget; sem mudar semântica.

**Caminhos críticos preservados:** sem mexer em ordem de checagens (token → JWT-reject → hash lookup → expiração → status do agent). Sem mudança de policy/RPC. Sem mudança de resposta HTTP/headers.

## Diagnóstico — `heartbeat/state-updater.ts`

`any`/casts identificados:
- L34 `updateData: AgentUpdate & { last_telemetry_at?: string, _current_agent?: any }` — `_current_agent` precisa de tipo `AgentRow | null`.
- L40 `(updateData as any).update_timestamp` — campo legado tolerado.
- L51–54 `'metadata_hash' in (updateData as any)` / `delete (updateData as any).metadata_hash` — HOTFIX-AUTH-01 (coluna inexistente).
- L63 `(currentAgent as any)[k]` — leitura dinâmica para diff.
- L80 `p_update_data: updateData as any` — assinatura do RPC `update_agent_heartbeat_atomic`.
- L105 `(updateData as any).version` — coalescência de version.
- L117–121 `({ ...updateData, status, last_heartbeat, version } as any)` — fallback MVCC.
- L161 `catch (e: any)` — token touch.
- L226 `processAnomalies: any[] | undefined` — payload variável (vinda do agente).
- L228 `const allProcs: any[] = []` — agregação de top_by_cpu/top_by_memory.

**Plano D2 (não executar agora):**
1. Criar `type CurrentAgentSnapshot = Pick<Database['public']['Tables']['agents']['Row'], 'version' | 'last_heartbeat'>` e usar em `_current_agent`.
2. Definir `interface ProcessSample { pid: number; name: string; cpu_percent: number; memory_mb: number; user: string; command_line?: string; }` para substituir `any[]`.
3. Tratar `processAnomalies` como `unknown[]` na fronteira e validar com narrowing.
4. Para o RPC `update_agent_heartbeat_atomic`, tipar `p_update_data` via `Database['public']['Functions']['update_agent_heartbeat_atomic']['Args']` (se existir nos types gerados); caso contrário, manter um único `as Json` localizado e documentar.
5. Manter HOTFIX `metadata_hash` exatamente como está, apenas trocando os `(... as any)` por um helper `stripMetadataHash(update: AgentUpdate)`.
6. `catch (e: any)` → `catch (e: unknown)` + narrow.

**Caminhos críticos preservados:** sem mexer no throttling (HEARTBEAT_WRITE_THROTTLE_MS, TELEMETRY_THROTTLE_MS), sem mexer no fallback MVCC nem na chamada RPC, sem mexer nos inserts de métricas/processos.

## Sequenciamento aprovado (do usuário)

1. **D1** — tipar `_shared/agent-auth.ts` em PR isolada (sem mudar comportamento, validar com lint+typecheck+gates).
2. **D2** — tipar `heartbeat/state-updater.ts` em PR isolada.
3. **D3** — só então abrir PR para remover `@ts-nocheck` de `heartbeat/index.ts` (depende de D1+D2 estarem em produção e estáveis).

**Não fazer agora:**
- Não remover `@ts-nocheck` de `heartbeat/index.ts`.
- Não tocar em `poll-jobs/index.ts`, `submit-job-result`, `ack-job`, `serve-agent.ts`.
- Não tocar em RLS/RPC/migrations.
- Não tocar em feature flags.

## Próximo passo

Aguardando aprovação para abrir **PR D1 — tipagem de `_shared/agent-auth.ts`** (mecânica, sem mudança de runtime).
