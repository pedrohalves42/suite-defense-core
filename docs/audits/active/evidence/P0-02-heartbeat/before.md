# P0-02 · Heartbeat offline nao detectado — BEFORE

Snapshot do estado do runtime em 2026-07-09 (antes da migration
`20260710_heartbeat_alignment.sql`).

## Gap classificado (Sprint 0 Day 2)

Ver `discovery.md` para a analise completa. Resumo:

```text
t=0        heartbeat OK
t=10min    agente marcado offline  (auto_mark_agents_inactive, threshold hardcoded 10min)
t=48h      primeiro alerta emitido (alert_long_offline_agents)
```

Backlog exige `alerta <= 3 * heartbeat_interval` -> ~3 minutos.
Gap medido: **47h50min entre deteccao e alerta**.

## Divergencias secundarias

| Fonte                                                     | Valor citado |
|-----------------------------------------------------------|--------------|
| Codigo `auto_mark_agents_inactive.v_threshold`            | `10 minutes` |
| `COMMENT ON FUNCTION auto_mark_agents_inactive`           | `>2 hours`   |
| `docs/runbooks/RUNBOOK-AGENT-OFFLINE.md` (v1.0)           | `2x intervalo`, tabela inexistente `agent_health_alerts` |
| `alert_long_offline_agents.WHERE last_heartbeat < ...`    | `48 hours`   |

## Trecho do codigo antigo (`supabase/migrations/20260426000000_baseline.sql`)

```sql
CREATE FUNCTION public.auto_mark_agents_inactive() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_threshold interval := '10 minutes';   -- <-- inconsistente com comentario
  ...
BEGIN
  UPDATE agents SET status = 'offline', ... WHERE ... last_heartbeat < v_cutoff;
END;
$$;

COMMENT ON FUNCTION public.auto_mark_agents_inactive() IS
  '... no heartbeat received for >2 hours. Should be called by cron every 15 minutes.';
```

Nenhum alerta era emitido entre `t=10min` e `t=48h`.
