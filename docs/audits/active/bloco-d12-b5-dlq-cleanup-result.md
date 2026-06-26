# Bloco D12-B5 — `dlq.ts` cleanup result

**Status:** ✅ Concluído
**Escopo:** remoção da diretiva `@ts-nocheck` em `supabase/functions/_shared/dlq.ts`.

## Arquivo alterado

| Arquivo | Mudança |
| --- | --- |
| `supabase/functions/_shared/dlq.ts` | Removida diretiva `// @ts-nocheck`. Removido import órfão `SupabaseClient` de `esm.sh/@supabase/supabase-js@2` (nunca referenciado — `supabase` é `any` nas assinaturas atuais). Cabeçalho JSDoc atualizado com nota de auditoria D12-B5. |

## Diretiva removida

1 diretiva ativa.

## Erros encontrados

`deno check supabase/functions/_shared/dlq.ts` após a remoção: **0 erros**. Nenhuma anotação adicional foi necessária. O `deno.json` do projeto roda com `strict: false` / `noImplicitAny: false`, então o reduce que indexa `acc[entry.status as keyof typeof acc]` permanece aceito sem mudança.

## Alterações type-only

Nenhuma além da remoção da diretiva e do import órfão. Interfaces públicas inalteradas:

- `interface DLQEntry { ... }` — inalterada.
- `interface DLQResult { ... }` — inalterada.
- `calculateNextRetry(currentRetry: number): string` — inalterada.
- `moveToDeadLetterQueue(supabase: any, entry: DLQEntry): Promise<DLQResult>` — inalterada.
- `resolveDLQEntry(supabase: any, dlqId: string, resolvedBy: string, notes?: string): Promise<{ success: boolean; error?: string }>` — inalterada.
- `getDLQEntriesForRetry(supabase: any, limit?: number): Promise<Record<string, unknown>[]>` — inalterada.
- `getDLQStats(supabase: any, tenantId?: string): Promise<{ pending; retrying; exhausted; resolved; avgRetries }>` — inalterada.

## Runtime preservado (auditoria item a item)

- **Tabela DLQ**: `failed_jobs_dlq` (select/insert/update) — inalterada.
- **Schedule de retry**: delays `[30, 120, 600, 1800, 3600]` segundos + jitter `0–10s`, clamp B23 em `currentRetry` — inalterado.
- **Prioridade**: `criticalJobs = ['update_agent','collect_antivirus_status','sync_blocked_websites']`, fórmula `max(1, basePriority - floor(errorCount/2))` — inalterada.
- **Dedup/Upsert**: lookup por `original_job_id`, incremento `error_count`, `error_history.slice(-10)`, `status='exhausted'` quando `retry_count >= max_retries (default 3)` — inalterado.
- **Payload persistido**: `original_job_id`, `tenant_id`, `agent_id`, `agent_name`, `job_type`, `payload`, `error_message`, `metadata { ..., priority, error_history, created_at }`, `next_retry_at` — inalterado.
- **Resolve**: campos `status='resolved'`, `resolved_at`, `resolved_by`, `resolution_notes` — inalterados.
- **Retry pull (B24)**: select projeta `id, original_job_id, job_type, payload, tenant_id, agent_id, agent_name, error_message, retry_count, max_retries, next_retry_at, status, metadata, created_at`, filtro `status='pending' AND next_retry_at <= now()`, ordem `next_retry_at asc`, `limit=10` default — inalterado.
- **Tratamento de erro**: todas as branches retornam `{ success:false, error: err.message }`; o `catch` final mantém narrowing `err instanceof Error ? err.message : 'Unknown error'` — inalterado.
- **Logs**: mesmas mensagens (`[DLQ] Moving job to DLQ`, `Updated existing entry`, `Created new DLQ entry`, `Error fetching retry entries`, etc.) com os mesmos campos contextuais. Nenhum token, HMAC secret, authorization header, service-role key ou payload sensível adicional foi exposto.
- **Best-effort vs propaga**: comportamento original mantido — DLQ retorna `DLQResult` aos chamadores; não foi adicionado nenhum `throw` novo e nenhum erro existente foi engolido.

## Consumers validados

`rg` localizou 2 consumers reais:

```
supabase/functions/ops-sync/handlers/sync-jobs.ts:7
  import { getDLQEntriesForRetry, calculateNextRetry } from '../../_shared/dlq.ts';
supabase/functions/ops-gateway/handlers/sync-jobs.ts:7
  import { getDLQEntriesForRetry, calculateNextRetry } from '../../_shared/dlq.ts';
```

`deno check`:

```
deno check supabase/functions/_shared/dlq.ts                       → OK
deno check supabase/functions/ops-sync/handlers/sync-jobs.ts       → OK
deno check supabase/functions/ops-gateway/handlers/sync-jobs.ts    → OK
```

Nenhuma alteração feita nos consumers.

## Gate expandido

`scripts/guard-no-ts-nocheck-tier1.sh` agora protege +1 path:

```
supabase/functions/_shared/dlq.ts
```

Total protegido: **33 arquivos**. Execução:

```
bash scripts/guard-no-ts-nocheck-tier1.sh
PASS: no active @ts-nocheck in protected Tier 1 / type-clean files.
EXIT=0
```

## Diretivas `_shared` restantes (3)

```
supabase/functions/_shared/ai-multi-provider.ts
supabase/functions/_shared/domain-events.ts
supabase/functions/_shared/hexagonal/adapters.ts
```

Bate com o esperado pelo veredito (3 diretivas restantes em `_shared`).

## Próximo alvo

**D12-B6 — `supabase/functions/_shared/hexagonal/adapters.ts`** (Onda 2 Operational, classificado como passante no inventário D12-A).
