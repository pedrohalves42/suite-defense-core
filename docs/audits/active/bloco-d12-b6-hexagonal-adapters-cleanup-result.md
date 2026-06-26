# Bloco D12-B6 — `hexagonal/adapters.ts` cleanup result

**Status:** ✅ Concluído
**Escopo:** remoção da diretiva `@ts-nocheck` em `supabase/functions/_shared/hexagonal/adapters.ts`.

## Arquivo alterado

| Arquivo | Mudança |
| --- | --- |
| `supabase/functions/_shared/hexagonal/adapters.ts` | Removida diretiva `// @ts-nocheck`. Removido import órfão `import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'` (tipo nunca referenciado — todos os adapters declaram `client/supabase: any`). Cabeçalho atualizado com nota de auditoria D12-B6. |

## Diretiva removida

1 diretiva ativa.

## Erros encontrados

`deno check supabase/functions/_shared/hexagonal/adapters.ts` após a remoção: **0 erros**. Nenhuma anotação adicional foi necessária. O `deno.json` do projeto roda com `strict: false` / `noImplicitAny: false`, então os callbacks `data.map((row) => …)` / `data.filter((agent) => …)` permanecem aceitos sem mudança.

## Alterações type-only

Nenhuma além da remoção da diretiva e do import de tipo órfão. Nenhuma assinatura pública foi modificada:

- `SupabaseVersionQueryAdapter implements VersionQueryPort` — inalterada.
  - `findLatestVersions(): Promise<LatestVersionInfo[]>`
  - `findOutdatedAgents(platform: Platform, latestVersion: string): Promise<OutdatedAgentInfo[]>`
- `SupabaseUpdateJobAdapter implements UpdateJobPort` — inalterada.
  - `hasPendingUpdateJob(agentId: string): Promise<boolean>`
  - `createUpdateJob(params: { agentId; agentName; tenantId; currentVersion; targetVersion; platform }): Promise<string>`
  - `setForceUpdateVersion(agentId: string, version: string, reason: string): Promise<void>`
- `SupabaseObservabilityAdapter implements ObservabilityPort` — inalterada.
  - `logScheduledJobRun(params: { jobKey; success; durationMs; result?; error?; processedCount; jobSource }): Promise<void>`
- `LoggingEventDispatcherAdapter implements EventDispatcherPort` — inalterada.
- `PersistingEventDispatcherAdapter implements EventDispatcherPort` — inalterada.

Helpers internos (`normalizeVersion`, `isNewerThan`, `inferAggregateType`) inalterados.

## Runtime preservado (auditoria item a item)

- **Tabelas/RPC**: `agent_versions` (select), `agents` (select/update), `jobs` (select/insert), `domain_events` (insert), RPC `log_scheduled_job_run` — inalterados.
- **Filtros de outdated agents**: `status='active'`, `os_type=platform`, `agent_version is not null`, `neq` em `latestVersion` e `latestNorm`, `or(scheduling_paused.is.null,scheduling_paused.eq.false)` — inalterados. Filtro semver de aplicação (rejeita igual e versão mais nova) preservado.
- **Insert de update job**: `type='update_agent'`, `status='queued'`, `approved=true`, payload `{ current_version, target_version, platform, auto_triggered:true }` — inalterado.
- **`hasPendingUpdateJob`**: `status in ['pending','queued','delivered']`, `limit(1)` — inalterado.
- **`setForceUpdateVersion`**: update de `force_update_version` e `force_update_reason`; falha é apenas logada (`logger.warn`) — comportamento best-effort preservado.
- **Observability**: RPC chamada com os mesmos parâmetros (`p_job_key`, `p_success`, `p_duration_ms`, `p_result`, `p_error`, `p_processed_count`, `p_job_source`); `p_result=null` quando `success=false`; falha capturada e logada como warn — inalterado.
- **Domain event dispatch**: log primeiro (sempre), persistência best-effort em `domain_events` com `aggregate_id`, `aggregate_type` (via `inferAggregateType`), `event_type`, `payload`, `occurred_on` — inalterado. Erros de persistência são logados e nunca propagados (`logger.error`, sem `throw`).
- **Logs**: mesmas mensagens (`[UpdateJobAdapter] Failed to set force_update_version`, `[ObservabilityAdapter] Failed to log job run`, `[DomainEvent] …`). Nenhum token, HMAC secret, authorization header, service-role key ou payload sensível adicional foi exposto.
- **Tratamento de erro**: `throw new Error(...)` mantido em `findLatestVersions`, `findOutdatedAgents` e `createUpdateJob`; demais paths permanecem best-effort.

## Exports preservados

Sem barrel `export *`. Todas as classes seguem exportadas nominalmente e batem com os imports do consumer:

```
export class SupabaseVersionQueryAdapter
export class SupabaseUpdateJobAdapter
export class SupabaseObservabilityAdapter
export class LoggingEventDispatcherAdapter
export class PersistingEventDispatcherAdapter
```

## Consumer validado

`rg` localizou 1 consumer real:

```
supabase/functions/ops-gateway/handlers/sync-cron.ts:9-12
  SupabaseVersionQueryAdapter,
  SupabaseUpdateJobAdapter,
  SupabaseObservabilityAdapter,
  PersistingEventDispatcherAdapter,
```

`deno check`:

```
deno check supabase/functions/_shared/hexagonal/adapters.ts        → OK
deno check supabase/functions/ops-gateway/handlers/sync-cron.ts    → OK
```

Nenhuma alteração feita no consumer.

## Gate expandido

`scripts/guard-no-ts-nocheck-tier1.sh` agora protege +1 path:

```
supabase/functions/_shared/hexagonal/adapters.ts
```

Total protegido: **34 arquivos**. Execução:

```
bash scripts/guard-no-ts-nocheck-tier1.sh
PASS: no active @ts-nocheck in protected Tier 1 / type-clean files.
EXIT=0
```

## Diretivas `_shared` restantes (2)

```
supabase/functions/_shared/ai-multi-provider.ts
supabase/functions/_shared/domain-events.ts
```

Bate com o esperado pelo veredito (2 diretivas restantes em `_shared`).

## Próximo alvo

**D12-B7 — `supabase/functions/_shared/ai-multi-provider.ts`** (Onda 2 Operational, classificado como passante no inventário D12-A).
