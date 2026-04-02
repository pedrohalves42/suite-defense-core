
## Batch 3B — Sync Restante (12 funções → inline no ops-gateway)

### Contexto
- 12 funções standalone proxy no `ACTION_TO_FUNCTION` (linhas 67-79 do ops-gateway)
- 7 frontend callers usando `supabase.functions.invoke()` direto
- 6 handlers sync já inlined (reset-daily-quotas, log-domain-event, etc.)
- Total: ~1370 linhas de lógica a extrair

### Middleware Atual
| Função | Middleware | Linhas |
|---|---|---|
| sync-blocked-websites | serveTenant | 100L |
| process-failed-jobs | serveInternal | 94L |
| process-scheduled-jobs | serveInternal | 112L |
| invoke-scheduled-jobs | serveInternal | 192L |
| maintenance-cron | serveInternal | 41L |
| system-maintenance | serveInternal | 94L |
| dlq-action | serveTenant | 106L |
| process-dlq-retries | serveInternal | 257L |
| release-sync | serveInternal | 78L |
| sync-storage-bucket | serveTenant | 141L |
| sync-stripe-subscriptions | serveInternal | 68L |
| sync-threat-feeds | serveInternal | 87L |

**Auth note:** ops-gateway já valida auth via `assertInternalCaller(allowAuthenticatedUsers)`. Para funções `serveTenant`, o tenant_id vem do payload. Para `serveInternal`, a validação de `INTERNAL_FUNCTION_SECRET` já é feita pelo gateway.

### Plano de Execução (3 steps)

#### Step 1: Criar handlers inlined (2 arquivos novos)
Dividir em 2 arquivos para manter cada um < 400L:

**`handlers/sync-jobs.ts`** (~550L) — funções de jobs e DLQ:
- `handleProcessFailedJobs` (de process-failed-jobs)
- `handleProcessScheduledJobs` (de process-scheduled-jobs)
- `handleInvokeScheduledJobs` (de invoke-scheduled-jobs)
- `handleDlqAction` (de dlq-action)
- `handleProcessDlqRetries` (de process-dlq-retries)

**`handlers/sync-infra.ts`** (~550L) — funções de infra e sync:
- `handleSyncBlockedWebsites` (de sync-blocked-websites)
- `handleMaintenanceCron` (de maintenance-cron)
- `handleSystemMaintenance` (de system-maintenance)
- `handleReleaseSync` (de release-sync)
- `handleSyncStorageBucket` (de sync-storage-bucket)
- `handleSyncStripeSubscriptions` (de sync-stripe-subscriptions)
- `handleSyncThreatFeeds` (de sync-threat-feeds)

#### Step 2: Atualizar ops-gateway/index.ts
- Importar novos handlers
- Registrar 12 novas entradas no `INLINED_HANDLERS`
- Remover as 12 entradas do `ACTION_TO_FUNCTION` (proxy map)

#### Step 3: Migrar frontend callers (7 arquivos)
| Arquivo | Chamada atual | Nova chamada |
|---|---|---|
| `src/components/admin/AgentSyncStatusCard.tsx:21` | `invoke('sync-blocked-websites')` | `callGateway('sync', 'sync-blocked-websites')` |
| `src/hooks/useBlockedWebsites.tsx:28` | `invoke('sync-blocked-websites', {...})` | `callGateway('sync', 'sync-blocked-websites', {...})` |
| `src/hooks/useDNSFilter.tsx:238` | `invoke('sync-blocked-websites', {...})` | `callGateway('sync', 'sync-blocked-websites', {...})` |
| `src/hooks/useThreatIntel.ts:101` | `invoke('sync-threat-feeds', {...})` | `callGateway('sync', 'sync-threat-feeds', {...})` |
| `src/pages/AgentTest/useAgentTest.ts:28` | `invoke('system-maintenance', {...})` | `callGateway('sync', 'system-maintenance', {...})` |
| `src/pages/admin/DeadLetterQueue/useDeadLetterQueue.ts:132` | `invoke('process-dlq-retries', {...})` | `callGateway('sync', 'process-dlq-retries')` |
| `src/pages/admin/WebActivity/index.tsx:170` | `invoke('sync-blocked-websites', {...})` | `callGateway('sync', 'sync-blocked-websites')` |

#### Step 4: Verificar referências internas em edge functions
Checar se outros edge functions chamam estas funções diretamente.

#### Step 5: Deletar 12 diretórios standalone + deploy
- Deletar `supabase/functions/{12 dirs}`
- `supabase--delete_edge_functions` para remover do Supabase
- Deploy ops-gateway atualizado

#### Step 6: Verificação final
- `npx tsc --noEmit` — zero errors
- `grep` para referências órfãs
- Deploy e teste via curl

### Resultado esperado
- −12 edge functions (−12 cold starts × ~4.3s = ~51.6s de latência removida)
- 7 frontend callers migrados para `callGateway`
- `ACTION_TO_FUNCTION` sync section: vazia (todas inlined)
