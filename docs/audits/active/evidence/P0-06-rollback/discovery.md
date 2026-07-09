# P0-06 — Rollback de update de agente

**Sprint 0 · Day 2 — Discovery (read-only)**
Date: 2026-07-09
Owner: Agent Lead
Mode: read-only — nenhuma alteração de runtime, wrapper, migration ou agente.

---

## Classificação

**`Needs Investigation`.**

Justificativa: existe **capacidade técnica** distribuída (use-case,
tabela de eventos, função de teste, estado no agente Windows) mas
**não há runbook operacional** nem evidência de drill de canário
concluído em <5 min. O item não é ausência total de controle
(portanto não é `Confirmed` puro), tampouco é `False Positive`
(o requisito de "caminho de volta documentado" não está satisfeito).

---

## Evidência coletada (read-only)

### 1. Camada de aplicação — use-case

`src/application/use-cases/RollbackUpdate.ts` (24 linhas):

- Implementa `RollbackUpdateUseCase`.
- Chama `update.rollback(reason)` no domínio e persiste.
- Publica `UpdateRolledBackEvent` via dispatcher.
- **Ausente:** verificação de canário, timeout, health-check pós-rollback.

### 2. Camada de dados — SQL

Arquivo: `supabase/migrations/20260426000000_baseline.sql`.

- Tabela `agent_rollback_events` (referenciada 9880, 9931).
- Tabela `rollback_test_results`.
- Função `execute_rollback_test(tenant_id, agent_id, dry_run)`
  (linha 9840+) com etapas:
  - `state_machine_check`
  - `integrity_baseline` (warning se ausente)
  - `execution_chain` (warning se ausente)
  - `rollback_simulation` (dry-run) OU criação de evento real
- Função `execute_ai_action_rollback()` (linha 9682+) — escopo distinto
  (rollback de ação de AI, não de update de agente).

### 3. Camada de agente — Windows

`agents/windows/modules/state.ps1`:

- `$script:RollbackStatePath = "$env:ProgramData\CyberShield\data\rollback_state.json"`.
- Estrutura persistida: `safe_mode`, `rollback_count`, `previous_version`,
  `last_rollback`.
- Flag de emergência: `$env:CYBERSHIELD_LEGACY_FALLBACK = '1'`
  (referenciada em `heartbeat.ps1`, `job-runner.ps1`, `legacy-fallback.ps1`).

### 4. Runbook operacional

Listagem de `docs/runbooks/`:

- Existem 27 runbooks (agente offline, DR, key rotation, edge deploy failure,
  falhas-agente, etc.).
- **Não existe** `RUNBOOK-ROLLBACK-*` específico para rollback de update de
  agente.
- `RUNBOOK-FALHAS-AGENTE.md` cobre falhas gerais, não o procedimento
  formal de reverter um canário quebrado em <5 min.

### 5. Dependência P0-02

Backlog declara `P0-06 depende de P0-02` (rollback precisa de heartbeat
confiável para saber se o canário voltou). Como P0-02 saiu como
`Confirmed` (gap de alerta de curto prazo), qualquer drill real de
rollback herda esse gap: não é possível provar "restaurou 100% do
canário em <5 min" sem alerta em janela < 5 min.

---

## Sinais numéricos

| Métrica                                            | Valor |
| -------------------------------------------------- | ----- |
| Use-cases de rollback (aplicação)                  | 1     |
| Tabelas SQL de rollback                            | 2     |
| Funções SQL de rollback (agente)                   | 1 (`execute_rollback_test`) |
| Persistência de estado no agente (Windows)         | sim   |
| Runbook operacional específico                     | 0     |
| Drill documentado nos últimos 90 dias              | 0     |
| Dependência bloqueante                             | P0-02 (Confirmed) |

---

## Guarda de freeze respeitada

- ❌ Nenhum runtime, wrapper, migration ou script de agente tocado.
- ❌ Nenhum `execute_rollback_test` disparado (nem dry-run).
- ❌ Nenhum `agent_rollback_events` inserido.
- ✅ Apenas leitura de código, SQL, docs e listagem de runbooks.

---

## Próximo passo (fora do Sprint 0)

Item permanece `Needs Investigation` até:

1. Spike de 0.5 dia mapeando o caminho ponta-a-ponta (
   backend → agente Windows → verificação → alerta).
2. Redação do runbook `RUNBOOK-AGENT-UPDATE-ROLLBACK.md`.
3. Só então é possível reclassificar para `Confirmed` (com evidência
   de drill em <5 min) ou reabrir para P0 Fix Execution.

Dependência: **P0-02 deve estar em `In Review` ou `Closed`** antes
de qualquer drill real (senão a métrica de <5 min é impossível de
medir).
