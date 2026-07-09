# Sprint 0 · Day 2 — Evidence Checklist (read-only)

Date: 2026-07-09
Owner: Reliability Program
Mode: **read-only** — nenhum runtime, cron, migration, wrapper,
`_shared/*`, agente ou runbook pode ser alterado por este checklist.

Objetivo: roteiro auditável do Dia 2 para classificar **P0-02
(Heartbeat)** e **P0-06 (Rollback de update de agente)** em
Discovery. Cada item lista ações permitidas, artefatos, critério
de classificação e guarda de freeze.

---

## Guardas globais (herdadas do Dia 1)

- ❌ Não editar `_shared/reliability/*`, wrappers, retry, breaker, idempotency.
- ❌ Não criar/alterar migrations, policies, GRANTs, roles, cron schedules.
- ❌ Não redeployar edge functions.
- ❌ Não executar `execute_rollback_test`, nem dry-run, nem drill real de canário.
- ❌ Não inserir em `agent_rollback_events` nem em `system_alerts`.
- ❌ Não alterar `RUNBOOK-AGENT-OFFLINE.md` nem criar novo runbook.
- ✅ Ler SQL, código de aplicação, código do agente, docs, runbooks.
- ✅ Produzir `discovery.md` em `evidence/P0-02-heartbeat/` e `evidence/P0-06-rollback/`.
- ✅ Atualizar coluna `Discovery` no `hardening-tracking-board.md`.

Toda escrita no repo deve ser **exclusivamente documental**.

---

## Critérios de classificação (aplicáveis aos dois itens)

| Classificação          | Definição operacional                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `Confirmed`            | Controle é **inexistente** OU existe mas **não cumpre o requisito verificável** do backlog. Evidência mostra gap real, mensurável, com número. |
| `Needs Investigation`  | Capacidade parcial encontrada; faltam artefatos operacionais (runbook, drill) OU dependência bloqueante impede medir o critério. Requer spike ≤0,5 dia antes de reclassificar. |
| `False Positive`       | Controle existe, atende o requisito e há evidência **verificável hoje** (log, query, arquivo, runbook). Backlog pode fechar sem P0 Fix. |
| `Reclassify`           | Descoberta muda a natureza do risco (ex.: Defect → Operational Readiness). Exige nota separada. |

Três eixos que a classificação **precisa distinguir explicitamente**:

- **Ausência de evidência** → `Needs Investigation` (não é `Confirmed`).
- **Risco potencial mas mitigado parcialmente** → `Confirmed` com escopo reduzido.
- **Controle inexistente** → `Confirmed` (Operational Readiness ou Security Control).

---

## P0-02 — Heartbeat offline não detectado

**Owner:** Agent Lead

### Ações permitidas

- [ ] `rg` por `auto_mark_agents_inactive`, `alert_long_offline_agents`,
  `agent_health_alerts`, `system_alerts`, `last_heartbeat` em
  `supabase/migrations/`, `supabase/functions/` e `docs/runbooks/`.
- [ ] Ler `RUNBOOK-AGENT-OFFLINE.md` na íntegra e cruzar tabelas citadas
  com o schema atual (via inspeção de SQL apenas).
- [ ] Confirmar threshold do código (`interval`) e comparar com o
  comentário `COMMENT ON FUNCTION`.
- [ ] Confirmar existência de cron report em `cron_health_checks`.
- [ ] `supabase--read_query` opcional, apenas `SELECT` em `information_schema`
  ou catálogo (`pg_proc`, `pg_cron.job`) — **nunca** em tabelas de negócio.

### Artefatos obrigatórios

- [ ] `evidence/P0-02-heartbeat/discovery.md` com:
  - Threshold real (código) × threshold documentado (comentário/runbook).
  - Janela entre detecção e alerta (número em minutos/horas).
  - Requisito do backlog (3× intervalo) e cálculo do gap.
  - Situação do runbook (existente / desatualizado / ausente).

### Critério de classificação

- `False Positive` **exige**: alerta gerado em janela ≤3× intervalo de
  heartbeat + runbook coerente com schema atual.
- `Confirmed` se: janela > 3× intervalo **ou** divergência código × doc
  **ou** tabela citada em runbook não existe no schema.
- `Needs Investigation` se: não foi possível confirmar cron schedule
  real (pg_cron não inspecionável) — mas função e alerta existem.

### Guarda de freeze

- ❌ Não alterar `v_threshold`, comentário, cron ou função.
- ❌ Não simular agente parado no runtime real.
- ❌ Não criar `agent_health_alerts` mesmo que o runbook cite.
- ❌ Não atualizar `RUNBOOK-AGENT-OFFLINE.md` — a correção documental
  é P0 Fix Execution, não Sprint 0.

---

## P0-06 — Rollback de update de agente

**Owner:** Agent Lead
**Depende de:** P0-02

### Ações permitidas

- [ ] `rg` por `rollback`, `RollbackUpdate`, `agent_rollback_events`,
  `execute_rollback_test`, `rollback_state.json`, `CYBERSHIELD_LEGACY_FALLBACK`
  em `src/`, `supabase/`, `agents/windows/`, `docs/runbooks/`.
- [ ] Ler `src/application/use-cases/RollbackUpdate.ts` na íntegra.
- [ ] Ler `agents/windows/modules/state.ps1` (funções de rollback state).
- [ ] Listar `docs/runbooks/` e confirmar ausência de runbook específico
  de rollback de update de agente.
- [ ] Não executar `execute_rollback_test` — inspecionar apenas o SQL da
  função (`sed -n` na migration).

### Artefatos obrigatórios

- [ ] `evidence/P0-06-rollback/discovery.md` com:
  - Camadas onde a capacidade existe (aplicação, SQL, agente).
  - Nome exato das tabelas e funções encontradas.
  - Estado da persistência no agente (arquivo, campos, flag de emergência).
  - Presença/ausência de runbook operacional.
  - Efeito da dependência P0-02 sobre a métrica de <5 min.

### Critério de classificação

- `False Positive` **exige**: runbook operacional + drill documentado
  em <5 min nos últimos 90 dias. Nenhum dos dois foi encontrado, portanto
  este resultado é impossível no Dia 2.
- `Confirmed` se: capacidade **inexistente** em qualquer das 3 camadas
  (aplicação, SQL, agente). Não é o caso — as 3 camadas existem.
- `Needs Investigation` se: capacidade existe mas **falta artefato
  operacional** (runbook, drill) OU dependência bloqueante (P0-02)
  impede medir o critério do backlog. **É o caso.**

### Guarda de freeze

- ❌ Não executar `execute_rollback_test`, mesmo em `dry_run = true`.
- ❌ Não inserir em `agent_rollback_events` nem em `rollback_test_results`.
- ❌ Não tocar `state.ps1`, `legacy-fallback.ps1`, `heartbeat.ps1`,
  `job-runner.ps1`.
- ❌ Não criar `RUNBOOK-AGENT-UPDATE-ROLLBACK.md` — isso é P0 Fix
  Execution.
- ❌ Não redisparar `CheckForUpdate` / `RollbackUpdate` em ambiente
  de teste real.

---

## Auditoria de encerramento do Dia 2

Ao final do Dia 2, verificar:

- [ ] 2 `discovery.md` novos em `evidence/P0-02-heartbeat/` e `evidence/P0-06-rollback/`.
- [ ] Coluna `Discovery` do `hardening-tracking-board.md` atualizada para P0-02 e P0-06.
- [ ] `evidence/sprint-0-day-2-checkpoint.md` publicado.
- [ ] Contador Sprint 0: **6/18** itens classificados.
- [ ] Zero mudança em runtime, migrations, cron, wrappers, agente.
- [ ] Zero execução de `execute_rollback_test`, `dry_run` ou drill.
- [ ] Gate intermediário do Grupo B (agent lifecycle) avaliado:
  se `P0-02` ou `P0-06` saírem como `Confirmed crítico` com impacto em
  fleet management, **pausar Sprint 0** e escalar antes do Dia 3.
