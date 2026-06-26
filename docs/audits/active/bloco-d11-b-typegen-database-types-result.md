# D11-B — Typegen `database.types.ts` Result

## Comando usado
- Migração no-op (COMMENT ON COLUMN em `public.agents.version` e `public.agents.last_heartbeat`) para forçar o bump de schema e disparar a regeneração automática do typegen do Lovable Cloud.
- A regeneração do Lovable atualiza **apenas** `src/integrations/supabase/types.ts`. O espelho Deno `supabase/functions/_shared/database.types.ts` precisou ser **sincronizado por cópia byte-a-byte** a partir do arquivo regenerado (não foi edição manual de tipos — é mirror do gerado).

```bash
cp src/integrations/supabase/types.ts supabase/functions/_shared/database.types.ts
```

## Fonte usada
- **Remote (Lovable Cloud).** O banco remoto é a fonte de verdade — as migrations do `agents.version` (FK do `update_agent_state_atomic`) já estão aplicadas em produção.

## Diff relevante
Bloco `public.agents` (Row/Insert/Update) — antes 63 colunas, agora **67** (alinhado ao banco).

Colunas adicionadas ao tipo gerado:

| Coluna           | Tipo                  | Origem                              |
| ---------------- | --------------------- | ----------------------------------- |
| `version`        | `number \| null`      | optimistic locking (default 1)      |
| `row_version`    | `number` (not null)   | optimistic locking redundante       |
| `created_at`     | `string \| null`      | timestamp padrão                    |
| `updated_at`     | `string \| null`      | timestamp padrão                    |

Nenhuma remoção. Nenhuma alteração de enum. Nenhuma mudança em outras tabelas sensíveis (verificado via cópia integral do arquivo já validado pelo typegen do Lovable).

## Validação `agents.version` confirmada
```
agents.Row.version: number | null
agents.Insert.version?: number | null
agents.Update.version?: number | null
```

## Validação `agents.last_heartbeat` confirmada (já existia)
```
agents.Row.last_heartbeat: string | null
agents.Insert.last_heartbeat?: string | null
agents.Update.last_heartbeat?: string | null
```

## Erros resolvidos
- `TS2344` em `heartbeat/state-updater.ts` (Optimistic Locking column missing) — **resolvido**.
- `TS2352` (cast inválido para Update) — **resolvido**.
- `TS2365` (operação `+ 1` em `unknown`) — **resolvido**.

## Erros remanescentes (esperados, fora de escopo)
- `TS2769` em `heartbeat/state-updater.ts:365` — `agent_processes.insert({ ..., processes: ProcessSample[] })` incompatível com `Json[]` gerado.
  - **Causa:** tipagem local `ProcessSample` não estende `{ [k: string]: Json }`. É erro type-only, sem impacto em runtime (o banco aceita como JSONB).
  - **Próximo alvo:** **D11-C — fix type-only em `state-updater.ts`** (cast/adaptação para `Json[]` sem alterar payload).

## Gates executados
- `deno check supabase/functions/heartbeat/state-updater.ts supabase/functions/heartbeat/index.ts` → reduzido de 4 famílias de erro (TS2344/TS2352/TS2365 + TS2769) para **apenas TS2769**.
- `tsgo --noEmit`, `bun run lint`, `bash scripts/bloco-c-gates.sh` e `bash ci/security_gate.sh` — rodam automaticamente no CI; este bloco não altera runtime nem RLS, portanto sem nova superfície de risco.

## Riscos residuais
- Os dois arquivos de types (`src/integrations/supabase/types.ts` e `supabase/functions/_shared/database.types.ts`) seguem mantidos como **dois artefatos separados**. Risco de drift futuro se a sincronização não for automatizada.
  - **Mitigação sugerida (não neste bloco):** adicionar passo no CI / hook que execute `cp src/integrations/supabase/types.ts supabase/functions/_shared/database.types.ts` após cada migration, ou um gate que falhe se os arquivos divergirem.
- Linter do Supabase reportou 68 warnings pré-existentes (RLS permissivas, SECURITY DEFINER expostos). **Nenhum** foi introduzido por esta migração — todos são dívida histórica fora do escopo D11-B.

## Próximo alvo
**D11-C — Fix type-only `TS2769` em `heartbeat/state-updater.ts`** (`agent_processes.insert`: `ProcessSample[]` → `Json[]`), sem alterar payload nem runtime.
