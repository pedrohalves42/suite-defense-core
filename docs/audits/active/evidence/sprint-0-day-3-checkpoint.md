# Sprint 0 · Day 3 Checkpoint

Date: 2026-07-09
Mode: read-only inspection
Runtime changes: **0**

## Itens classificados (10 / 18)

| ID    | Classificação          | Nota                                                                                       |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------ |
| P0-01 | Needs Investigation    | (Day 1) 71 WARN / 0 ERROR; always-true + SECURITY DEFINER expostos pendentes.              |
| P0-10 | False Positive (24h)   | (Day 1) 0 hits em código; falta evidência de 24h de logs.                                  |
| P0-07 | Needs Investigation    | (Day 1) 0 primitivas de assinatura em funções candidatas.                                  |
| P0-08 | Confirmed              | (Day 1) Backup existe; restore verificado não.                                             |
| P0-02 | Confirmed              | (Day 2) Detecção 10 min, alerta 48h. Gap ~47h50min vs requisito 3× intervalo.              |
| P0-06 | Needs Investigation    | (Day 2) Capacidade nas 3 camadas; sem runbook nem drill <5 min; depende de P0-02.          |
| **P0-04** | **Needs Investigation** | Frontend step-up + política MFA por tenant existem; enforcement server-side (AAL2) não comprovado. |
| **P0-05** | **Needs Investigation** | Primitiva `_shared/reliability/idempotency.ts` (160 LOC) + testes + coluna SQL + RPC; cobertura por endpoint não enumerada. |
| **P0-03** | **Confirmed**           | Retry externo em lookups existe; checkpoint/resume de scan interrompido inexistente; sem runbook. |
| **P0-09** | **Needs Investigation** | Primitiva `isKillSwitchEnabled` + tabela + UI + fail-closed documentado; sem runbook dedicado nem drill <60s. |

Notas de discovery adicionadas:

- `evidence/P0-04-auth-mfa/discovery.md`
- `evidence/P0-05-idempotency/discovery.md`
- `evidence/P0-03-scan-recovery/discovery.md`
- `evidence/P0-09-kill-switch/discovery.md`

Checklist do Day 3:

- `evidence/sprint-0-day-3-evidence-checklist.md`

## Sinais numéricos — Day 3

| Sinal                                                       | Valor |
| ----------------------------------------------------------- | ----- |
| Hooks/componentes step-up (frontend)                        | 3     |
| Enforcement AAL2 server-side comprovada                     | não   |
| Primitiva idempotency (`_shared/reliability`)               | 1 (160 LOC) |
| Tabelas com coluna `idempotency_key`                        | ≥1    |
| RPCs com `p_idempotency_key`                                | ≥1    |
| `withRetry` em scan-virus                                   | sim   |
| Checkpoint/resume de scan                                   | não   |
| Runbook de scan recovery                                    | 0     |
| Primitiva kill-switch (`isKillSwitchEnabled`)               | 1     |
| Tabela `system_kill_switch`                                 | 1     |
| Callers comprovados de kill-switch                          | ≥2    |
| Runbook dedicado de kill-switch                             | 0     |

## Gate intermediário — Grupo C (Reliability)

- P0-04 → `Needs Investigation` (spike server-side, sem escalação).
- P0-05 → `Needs Investigation` (enumerar cobertura por endpoint).
- P0-03 → `Confirmed` — gap real (sem checkpoint), mas **não
  crítico**: scan pode ser refeito; nenhum dado é perdido, apenas
  trabalho.
- P0-09 → `Needs Investigation` (documentação/drill; controle já
  existe e é fail-closed).

Nenhum item exige pausa. **Sprint 0 pode prosseguir para o Day 4
(Compliance / Backlog restante — 8 itens finais).**

## Distribuição acumulada (10/18)

| Status              | Qtd |
| ------------------- | --- |
| Confirmed           | 3   |
| Needs Investigation | 5   |
| False Positive*     | 2   |
| Pending             | 8   |

*P0-10 pendente evidência de 24h de runtime logs.

## Estado dos gates

```text
Sprint 0 Discovery   🟡 RUN  (10/18)
P0 Fix Execution     🔒
RC-2.1               🔒
Commercial Gate      🔒
Pilot Tenant         🔒
Wave 3B              🔒
R5                   🔒

Runtime touched:     0 linhas
_shared/reliability: intocado
Wrappers / retry / breaker / idempotency: intocados
Cron / migrations / policies / GRANTs: intocados
Kill-switch flags: 0 toggles
Scans reais: 0
```

## Próxima ação (Day 4)

Grupo D — Compliance / restante do backlog P0 e revisão P1
prioritários. Manter as mesmas guardas de freeze.

Meta cumulativa Day 4: **18/18 classificados** → encerramento do
Sprint 0 Discovery e apresentação para decisão de fase de execução.
