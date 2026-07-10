# P0-02 · Heartbeat offline nao detectado — AFTER

Estado apos migration `20260710_heartbeat_alignment.sql` (aplicada 2026-07-10).

## Timeline canonica

```text
t=0        heartbeat OK
t=3min     agente marcado offline    (auto_mark_agents_inactive, threshold=3min)
t=3min     alerta MEDIUM emitido     (alert_short_offline_agents, alert_type='agent_short_offline')
t=48h      alerta HIGH emitido       (alert_long_offline_agents, escalacao)
```

Requisito do backlog (`alert <= 3 * heartbeat_interval`) atendido.

## Constantes canonicas

| Constante                       | Valor | Local                                                                     |
|---------------------------------|-------|---------------------------------------------------------------------------|
| `HEARTBEAT_INTERVAL_SECONDS`    | 60    | `supabase/functions/_shared/agent-lifecycle/heartbeat-thresholds.ts`      |
| `OFFLINE_THRESHOLD_SECONDS`     | 180   | mesmo arquivo + `auto_mark_agents_inactive()` (3min)                      |
| `ALERT_SHORT_THRESHOLD_SECONDS` | 180   | `alert_short_offline_agents()` (3min, severity medium)                    |
| `ALERT_LONG_THRESHOLD_HOURS`    | 48    | `alert_long_offline_agents()` (severity high, escalacao)                  |

## Cron ativo

| Job name                  | Cadence  | Alvo                                          |
|---------------------------|----------|-----------------------------------------------|
| `auto-mark-inactive-1m`   | `* * * * *` | `public.auto_mark_agents_inactive()`       |
| `alert-short-offline-1m`  | `* * * * *` | `public.alert_short_offline_agents()`      |

(Escalonamento longo `alert_long_offline_agents` mantido como estava.)

## Alteracoes de codigo

- `supabase/functions/_shared/agent-lifecycle/heartbeat-thresholds.ts` (novo)
- Migration `20260710_heartbeat_alignment.sql`:
  - `auto_mark_agents_inactive()` -> threshold `3 minutes`, `COMMENT` alinhado.
  - `alert_short_offline_agents()` (nova) — severity medium, dedup por `(agent_id, alert_type, resolved=false)`.
- `docs/runbooks/RUNBOOK-AGENT-OFFLINE.md` v1.1 — thresholds canonicos e referencia correta a `system_alerts`.
- `docs/security/SECURITY_INVARIANTS_CHANGELOG.md` — entrada 2026-07-10.
- `tools/tests/assert_heartbeat_thresholds.sql` — invariant guard em CI.
- `src/__tests__/offline-agent-alerting.test.ts` — cenarios normal / perdido / retomado.

## Prova funcional em janela sintetica

Executar em ambiente de staging apos deploy:

```sql
-- 1. Cria um agent sintetico com heartbeat ha 4 minutos
INSERT INTO agents (tenant_id, agent_name, status, last_heartbeat)
VALUES ('<synthetic-tenant>', 'p0-02-probe', 'active', now() - interval '4 minutes')
RETURNING id;

-- 2. Rodar as duas funcoes
SELECT public.auto_mark_agents_inactive();     -- deve marcar offline
SELECT public.alert_short_offline_agents();    -- deve criar 1 alerta

-- 3. Verificar
SELECT alert_type, severity, resolved, title
FROM system_alerts
WHERE agent_id = '<id>' AND alert_type = 'agent_short_offline';
-- esperado: 1 linha, severity='medium', resolved=false
```

Anexar a saida deste bloco ao PR de fechamento.

## Fechamento

- Board: `hardening-tracking-board.md` — P0-02 -> `Confirmed · Closed`.
- Bundle: este arquivo + `before.md` + link para migration.
