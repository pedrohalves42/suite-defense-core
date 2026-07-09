# P0-02 — Heartbeat offline não detectado

**Sprint 0 · Day 2 — Discovery (read-only)**
Date: 2026-07-09
Owner: Agent Lead
Mode: read-only — nenhuma alteração de runtime, wrapper, migration ou cron.

---

## Classificação

**`Confirmed` (parcial — gap de janela + inconsistência de threshold).**

Justificativa: existe detecção automática e existe alerta, mas a **janela
entre "agente parado" e "alerta emitido" ultrapassa o requisito do
backlog** (3× intervalo de heartbeat) e há inconsistência declarada
entre código e documentação da própria função.

---

## Evidência coletada (read-only)

### 1. Detecção — `auto_mark_agents_inactive()`

Arquivo: `supabase/migrations/20260426000000_baseline.sql:1720-1765`.

```sql
v_threshold interval := '10 minutes';
...
UPDATE agents SET status = 'offline', agent_state = 'offline', ...
 WHERE status = 'active'
   AND last_heartbeat IS NOT NULL
   AND last_heartbeat < now() - v_threshold;
```

- Threshold real no código: **10 min**.
- Comentário oficial da função (linha 1770):
  `'... no heartbeat received for >2 hours. Should be called by cron every 15 minutes.'`
- Divergência confirmada entre **código (10m)** e **doc (2h + 15m cron)**.
- Report para `cron_health_checks` presente (observabilidade OK).

### 2. Alerta prolongado — `alert_long_offline_agents()`

Arquivo: `supabase/migrations/20260426000000_baseline.sql:488-530`.

- Dispara apenas quando `last_heartbeat < now() - interval '48 hours'`.
- Insere em `system_alerts` com dedup por `agent_id + alert_type + resolved=false`.
- Severidade `high`, tipo `agent_long_offline`.

### 3. Gap identificado

Nenhuma função gera alerta na transição `active → offline` (curto prazo).
Sequência atual:

```text
t=0        heartbeat OK
t=10min    marcado offline (auto_mark_agents_inactive)
t=48h      primeiro alerta emitido (alert_long_offline_agents)
```

Backlog exige: agente parado **3× intervalo** deve produzir alerta.
Com intervalo padrão de heartbeat de 60s, o requisito é **~3 min**,
não 48h.

### 4. Runbook operacional

`docs/runbooks/RUNBOOK-AGENT-OFFLINE.md` existe, com procedimentos
de diagnóstico e escalação. Cita `agent_health_alerts` — tabela
**não localizada** no schema atual (apenas `system_alerts`). Doc
desatualizada.

---

## Sinais numéricos

| Métrica                                            | Valor |
| -------------------------------------------------- | ----- |
| Funções de detecção offline                        | 1     |
| Funções de alerta offline                          | 1     |
| Threshold real de marcação offline                 | 10 min |
| Threshold real de alerta                           | 48 h  |
| Requisito do backlog (3× intervalo de heartbeat)   | ~3 min |
| Gap entre detecção e alerta                        | ~47h50min |
| Divergência código × comentário                    | sim   |
| Runbook operacional                                | existe (desatualizado)|

---

## Guarda de freeze respeitada

- ❌ Nenhuma alteração em `_shared/reliability/*`.
- ❌ Nenhuma alteração em cron, threshold, função ou migration.
- ❌ Nenhum ajuste em wrappers de heartbeat ou runtime.
- ✅ Somente leitura de SQL, docs e código do agente.

---

## Próximo passo (fora do Sprint 0)

Correção pertence à fase **P0 Fix Execution**:

1. Definir threshold único e canônico (ex.: 3× `heartbeat_interval_seconds`).
2. Alinhar código, comentário e runbook.
3. Introduzir alerta de curto prazo entre detecção e `alert_long_offline_agents`.
4. Evidência ANTES/DEPOIS: simulação de agente parado por 3× intervalo →
   registro em `system_alerts` + entrada em `audit_log`.
