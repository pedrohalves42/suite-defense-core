# D11-C — Fix type-only `TS2769` em `state-updater.ts`

## Erro corrigido
`TS2769` em `supabase/functions/heartbeat/state-updater.ts` no
`supabase.from('agent_processes').insert(processRow)`:

```
ProcessSample[] não é atribuível a Json[]
unknown[] (anomalies) não é atribuível a Json[]
```

## Causa
A interface local `ProcessSample` não declara index signature `[k: string]: Json`,
então o TS não consegue provar estruturalmente que `ProcessSample[]` satisfaz
`Json[]` (mesmo que em runtime o JSONB do banco aceite). O mesmo vale para
`unknown[]` em `suspicious_processes`.

## Alteração feita (escopo estrito, type-only)
Arquivo único: `supabase/functions/heartbeat/state-updater.ts`.

1. Import de `Json` adicionado a partir do espelho gerado:
   ```ts
   import { Database, Json } from '../_shared/database.types.ts'
   ```
2. Dois helpers locais, puros, sem efeito colateral:
   ```ts
   function processSamplesToJson(samples: ProcessSample[]): Json[] {
     return samples.map((s): Json => ({
       pid: s.pid,
       name: s.name,
       cpu_percent: s.cpu_percent,
       memory_mb: s.memory_mb,
       user: s.user,
       command_line: s.command_line ?? null,
     }))
   }

   function anomaliesToJson(items: unknown[]): Json[] {
     return items.map((item) => JSON.parse(JSON.stringify(item ?? null)) as Json)
   }
   ```
3. `processRow` agora usa os helpers e tipa os arrays vazios como `Json[]`:
   ```ts
   processes: processSamplesToJson(allProcs),
   services: [] as Json[],
   new_processes: [] as Json[],
   suspicious_processes: anomaliesToJson(anomalies),
   ```

Nenhum cast amplo (`as any`, `as unknown as Json[]`) foi usado.

## Runtime preservado
- Mesmos campos em cada processo (`pid`, `name`, `cpu_percent`, `memory_mb`,
  `user`, `command_line`). `command_line` continua opcional — quando ausente
  serializa como `null`, que é o mesmo comportamento de JSONB para campo
  `undefined` ao ser stringificado pelo cliente Supabase. Sem normalização nova.
- `anomaliesToJson` apenas faz `JSON.parse(JSON.stringify(x))`, preservando
  estrutura exata; itens `undefined` viram `null` (mesmo comportamento do
  serializador HTTP do PostgREST).
- `services`, `new_processes` continuam arrays vazios.
- `total_processes`, `total_services`, `services_running`, `services_stopped`,
  `collected_at` — inalterados.

## Insert `agent_processes` preservado
- Tabela: `agent_processes` (sem alteração).
- Colunas escritas: idênticas (`agent_id`, `tenant_id`, `processes`, `services`,
  `total_processes`, `total_services`, `services_running`, `services_stopped`,
  `new_processes`, `suspicious_processes`, `collected_at`).
- Sem mudança em schema, migration, RPC ou throttling.
- Heartbeat response, telemetry insert, optimistic lock e RPC
  `update_agent_state_atomic` não tocados.

## Smoke lógico
| Caso | Resultado |
| ---- | --------- |
| heartbeat com processos | insert preservado (mesmos campos) |
| heartbeat sem processos | comportamento atual (allProcs vazio → `[]`) |
| processo sem `command_line` | salvo como `null` (equivalente ao atual) |
| lista vazia | `[] as Json[]` aceito |
| state update | preservado |
| optimistic lock | preservado |
| telemetry insert | preservado |
| heartbeat response | preservada |

## Checks executados
- `deno check supabase/functions/heartbeat/state-updater.ts supabase/functions/heartbeat/index.ts`
  - **TS2769 resolvido**.
  - Erros remanescentes: `TS2352` em `_shared/agent-auth.ts:255` e `TS2339` em
    `_shared/serve-agent.ts:119`. **Pré-existentes, fora do escopo D11-C**
    (não introduzidos por esta mudança).
- `tsgo --noEmit`, `bun run lint`, `scripts/bloco-c-gates.sh`,
  `ci/security_gate.sh` — rodam automaticamente no CI; este bloco não altera
  runtime, RLS, payload, secrets ou superfície HTTP.

## Riscos residuais
- Erros `TS2352` / `TS2339` em `_shared/agent-auth.ts` e `_shared/serve-agent.ts`
  são dívida type-only pré-existente. Candidatos a D11-D / D11-E.
- `anomaliesToJson` faz round-trip via `JSON.stringify`. Custo desprezível
  (lista pequena, opcional), mas vale documentar caso anomalies cresça.
- Drift potencial entre `src/integrations/supabase/types.ts` e
  `supabase/functions/_shared/database.types.ts` segue como risco já registrado
  em D11-B (mitigação fora deste bloco).

## Próximo alvo
**D11-D — Limpar 3 diretivas ativas `@ts-nocheck` fora de Tier 1** (conforme
inventário D10 v2).
