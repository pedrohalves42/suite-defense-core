# Sprint 0 · Day 2 Checkpoint

Date: 2026-07-09
Mode: read-only inspection
Runtime changes: **0**

## Itens classificados (6 / 18)

| ID    | Classificação          | Nota                                                                                    |
| ----- | ---------------------- | --------------------------------------------------------------------------------------- |
| P0-01 | Needs Investigation    | (Dia 1) Linter 71 WARN / 0 ERROR; triagem individual pendente.                          |
| P0-10 | False Positive (24h)   | (Dia 1) 0 hits em código; falta evidência de 24h de logs.                               |
| P0-07 | Needs Investigation    | (Dia 1) 0 primitivas de assinatura em 5 funções candidatas.                             |
| P0-08 | Confirmed              | (Dia 1) Backup existe; restore verificado não — gap processual.                         |
| **P0-02** | **Confirmed**       | Detecção existe (10 min), mas alerta só em ≥48h. Backlog exige 3× intervalo (~3 min). Divergência código × comentário (10m vs 2h). |
| **P0-06** | **Needs Investigation** | Capacidade nas 3 camadas (use-case, SQL, agente Windows). Sem runbook operacional; sem drill em <5 min; dependente de P0-02. |

Notas de discovery adicionadas:

- `docs/audits/active/evidence/P0-02-heartbeat/discovery.md`
- `docs/audits/active/evidence/P0-06-rollback/discovery.md`

Checklist do Dia 2:

- `docs/audits/active/evidence/sprint-0-day-2-evidence-checklist.md`

## Sinais numéricos — Dia 2

| Sinal                                                       | Valor         |
| ----------------------------------------------------------- | ------------- |
| Funções SQL de detecção offline                             | 1 (`auto_mark_agents_inactive`) |
| Threshold real da detecção                                  | 10 min        |
| Threshold declarado no comentário oficial                   | 2 h           |
| Função SQL de alerta prolongado                             | 1 (`alert_long_offline_agents`) |
| Threshold do alerta                                         | 48 h          |
| Gap entre detecção e alerta                                 | ~47h50min     |
| Requisito do backlog                                        | 3× intervalo  |
| Tabela citada no runbook mas ausente do schema              | `agent_health_alerts` |
| Use-cases de rollback (aplicação)                           | 1             |
| Tabelas SQL de rollback                                     | 2             |
| Funções SQL de rollback (agente)                            | 1             |
| Persistência de rollback no agente Windows                  | sim (`rollback_state.json`) |
| Runbook específico de rollback de update de agente          | 0             |
| Drill documentado <5 min nos últimos 90 dias                | 0             |

## Gate intermediário — Grupo B (Agent lifecycle)

- P0-02 saiu como `Confirmed` — gap real, mas **não crítico**: existe
  detecção e existe alerta prolongado; falta apenas alerta de curto
  prazo e alinhamento código × doc. Nada é ausência total de controle.
- P0-06 saiu como `Needs Investigation` — capacidade existe nas 3
  camadas; falta runbook e drill. Dependência bloqueante em P0-02
  reforça classificação (não é possível medir <5 min sem alerta em
  janela curta).
- Nenhum item exige pausa do Sprint 0.

**Sprint 0 pode prosseguir para o Dia 3 (Reliability dependent).**

## Estado dos gates

```text
Sprint 0 Discovery   🟡 RUN  (6/18)
P0 Fix Execution     🔒
RC-2.1               🔒
Commercial Gate      🔒
Pilot Tenant         🔒
Wave 3B              🔒
R5                   🔒

Runtime touched:     0 linhas
_shared/reliability: intocado
Wrappers:            intocados
Cron / migrations:   intocados
Agente (Windows):    intocado
```

## Próxima ação

Dia 3 — Reliability dependent:

- `P0-04` Auth / MFA / step-up — Security Lead (depende de P0-01)
- `P0-05` Idempotency — Reliability Lead (depende de P0-01, P0-04)
- `P0-03` Scan recovery — Reliability Lead (depende de P0-05)
- `P0-09` Kill-switch — Ops Lead (depende de P0-01)

Meta cumulativa Dia 3: **10/18** itens classificados.
