
# Plano: Migração de Cron Jobs para Gateways (Seção 4, Item 2)

## Diagnóstico Atual

### Cron jobs que chamam edge functions via `net.http_post` (2 jobs):
| Job | Função Standalone | Frequência |
|-----|------------------|-----------|
| `honeypot-check-alerts` | `check-honeypot-alerts` | */5 min |
| `honeypot-dispatch-ai` | `dispatch-honeypot-ai` | */10 min |

### Standalone functions chamadas por cron (via `serveInternal`, não por `pg_cron` HTTP):
| Função | Já inlinada no gateway? |
|--------|------------------------|
| `watchdog-non-execution` | ✅ Já inlinada em `ops-gateway` como `check:watchdog-non-execution` |
| `verify-log-integrity` | ⚠️ Proxy via `api-gateway` (`ACTION_TO_FUNCTION`) |
| `process-agent-updates` | ❌ Não está em nenhum gateway |
| `seed-collection-jobs` | ❌ Não está em nenhum gateway |

### Cron jobs que já são SQL puro (sem ação necessária): 25 jobs
Todos os outros jobs já executam `SELECT public.function()` diretamente — zero cold starts, custo zero de edge function.

---

## Plano de Execução (3 Etapas)

### Etapa 1: Migrar os 2 cron jobs HTTP para gateways
**Objetivo**: Eliminar chamadas diretas a `check-honeypot-alerts` e `dispatch-honeypot-ai`.

**Ação**: Criar 2 novos handlers inlinados no `ops-gateway`:
- `check:honeypot-alerts` → inlinar lógica de `check-honeypot-alerts/index.ts`
- `check:honeypot-dispatch-ai` → inlinar lógica de `dispatch-honeypot-ai/index.ts`

**Depois**: Atualizar os 2 cron jobs via `cron.alter_job()` para chamar `ops-gateway` com o action correto em vez das funções standalone.

**Impacto**: -2 cold starts por execução (a cada 5 e 10 min = ~432 cold starts/dia eliminados)

### Etapa 2: Inlinar `process-agent-updates` e `seed-collection-jobs` nos gateways
**Objetivo**: Eliminar 2 standalone functions que são chamadas por cron/admin.

**Ação**:
- `process-agent-updates` → inlinar como `check:process-agent-updates` no `ops-gateway`
- `seed-collection-jobs` → inlinar como `sync:seed-collection-jobs` no `ops-gateway`

**Impacto**: -2 edge functions standalone

### Etapa 3: Atualizar cron jobs e deletar diretórios standalone
**Ação SQL (via `supabase--insert`)**:
```sql
-- Atualizar honeypot-check-alerts para usar ops-gateway
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'honeypot-check-alerts'),
  new_command := $$ SELECT net.http_post(
    url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/ops-gateway',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body := '{"action":"check:honeypot-alerts","payload":{}}'::jsonb
  ); $$
);
-- Repetir para honeypot-dispatch-ai
```

**Deletar 4 diretórios standalone**:
- `supabase/functions/check-honeypot-alerts/`
- `supabase/functions/dispatch-honeypot-ai/`
- `supabase/functions/process-agent-updates/`
- `supabase/functions/seed-collection-jobs/`

**Nota**: `verify-log-integrity` e `watchdog-non-execution` já estão roteados/inlinados nos gateways — os diretórios standalone podem ser deletados após confirmar que nenhum cron job os chama diretamente.

---

## Resultado Esperado
- **-4 a -6 edge functions standalone** eliminadas
- **-432 cold starts/dia** (honeypot alone)
- **Economia estimada**: ~$2-5/mês em invocações + latência
- Todos os cron jobs passam pelos gateways (observabilidade centralizada)
