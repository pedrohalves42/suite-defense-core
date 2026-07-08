# Hardening Sprint 0 — Discovery

Date: 2026-07-08
Owner: Reliability Program
Status: **PENDING** — pré-requisito para iniciar execução do backlog

---

## Objetivo

Antes de corrigir qualquer item P0/P1, **confirmar que o problema existe** no
sistema real. O backlog atual foi derivado de risco arquitetural, não
necessariamente de bugs observados. Executar correções contra falsos positivos
gera:

- retrabalho;
- evidência inválida;
- falsa sensação de progresso;
- risco de tocar `_shared/reliability/*` desnecessariamente (viola freeze).

Sprint 0 responde, para cada item: **isso é um bug real, uma ausência de
controle, ou já existe e falta apenas evidência formal?**

---

## Escopo

- 10 itens P0 (`P0-01` … `P0-10`).
- 8 itens P1 (`P1-01` … `P1-08`).

Sprint 0 **não altera código de runtime**. Apenas:

- lê código;
- roda queries;
- roda linter;
- inspeciona configurações;
- documenta o estado atual.

---

## Saídas por item (uma linha por P0/P1)

Cada item recebe classificação Discovery:

| Classificação        | Significado                                                             | Próxima ação                                    |
| -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| `Confirmed`          | Problema reproduzido, com evidência arquivada                           | Entra na fila de execução com prioridade normal |
| `False Positive`     | Controle já existe e funciona; só faltava evidência formal              | Coletar evidência **DEPOIS** e fechar direto    |
| `Needs Investigation`| Ambiguidade; parte do controle existe, comportamento parcial            | Nova sub-issue de spike com timebox             |
| `Reclassify`         | Item é na verdade P1/P2 (ou vice-versa) — severidade original incorreta | Mover no backlog + tracking board               |

---

## Perguntas guiadas por categoria

Para cada P0/P1, o dono responde 4 perguntas antes de mudar a Discovery:

1. **Existe hoje?** O controle/comportamento existe em produção?
2. **Como sei?** Qual arquivo/tabela/log/config prova a resposta acima?
3. **Reproduz?** Consigo reproduzir a falha ou observar a ausência?
4. **Custo real de fechamento?** Correção de código, apenas evidência, ou spike?

Exemplo aplicado a **P0-07 Signing / integridade do installer**:

- Existe hoje? — verificar `supabase/functions/agent-installer/*` e artefatos publicados.
- Como sei? — presença/ausência de campo `signature`/`manifest_sha256` no payload.
- Reproduz? — baixar installer, alterar hash, tentar executar em host de teste.
- Custo? — pode ser `Confirmed` (implementar signing) ou `False Positive` (já assina, falta doc).

---

## Tabela de execução do Sprint 0

Preencher durante o sprint. Nada aqui fecha itens do backlog — apenas
qualifica-os para execução.

| ID | Dono | Existe hoje? | Reprodução | Classificação | Link para nota de discovery |
| --- | --- | :-: | --- | :-: | --- |
| P0-01 | Security Lead | ? | linter + query cross-tenant | Pending | `evidence/P0-01-rls/discovery.md` |
| P0-02 | Agent Lead    | ? | simulação heartbeat | Pending | `evidence/P0-02-heartbeat/discovery.md` |
| P0-03 | Reliability Lead | ? | injeção falha pós-upload | Pending | `evidence/P0-03-scan-loss/discovery.md` |
| P0-04 | Security Lead | ? | e2e auth | Pending | `evidence/P0-04-auth/discovery.md` |
| P0-05 | Reliability Lead | ? | reenvio 10× | Pending | `evidence/P0-05-idempotency/discovery.md` |
| P0-06 | Agent Lead    | ? | canário forçado a falhar | Pending | `evidence/P0-06-rollback/discovery.md` |
| P0-07 | Security Lead | ? | hash tampering | Pending | `evidence/P0-07-installer/discovery.md` |
| P0-08 | Ops Lead      | ? | restore dry-run | Pending | `evidence/P0-08-restore/discovery.md` |
| P0-09 | Ops Lead      | ? | flag tenant + medir stop | Pending | `evidence/P0-09-killswitch/discovery.md` |
| P0-10 | Security Lead | ? | grep 24h logs | Pending | `evidence/P0-10-secrets/discovery.md` |
| P1-01 | Ops Lead      | ? | contagem alertas 72h | Pending | `evidence/P1-01-alerts/discovery.md` |
| P1-02 | Reliability Lead | ? | amostra 200 logs | Pending | `evidence/P1-02-logs/discovery.md` |
| P1-03 | Reliability Lead | ? | baseline p95/p99 | Pending | `evidence/P1-03-latency/discovery.md` |
| P1-04 | Product Lead  | ? | query campos nulos | Pending | `evidence/P1-04-report/discovery.md` |
| P1-05 | Product Lead  | ? | Playwright 6 telas | Pending | `evidence/P1-05-ux/discovery.md` |
| P1-06 | Security Lead | ? | load test 100 req/min | Pending | `evidence/P1-06-ratelimit/discovery.md` |
| P1-07 | Ops Lead      | ? | inspeção dashboards | Pending | `evidence/P1-07-dashboard/discovery.md` |
| P1-08 | Ops Lead      | ? | inventário runbooks | Pending | `evidence/P1-08-runbooks/discovery.md` |

---

## Critério de encerramento do Sprint 0

Sprint 0 fecha quando **todos os 18 itens** têm classificação diferente de
`Pending` **e** um link válido para nota de discovery. Só então:

```text
Sprint 0 Discovery
        ↓
P0 Fix Execution   ← libera aqui
        ↓
P0 Evidence Review
        ↓
RC-2.1 Synthetic Validation
        ↓
Commercial Readiness
        ↓
Pilot Tenant
        ↓
RC-2 Final Evidence
        ↓
Somente então avaliar Wave 3B
```

---

## Restrições (herdadas do freeze)

Durante o Sprint 0, permanece proibido:

- editar `_shared/reliability/*`;
- alterar wrappers, thresholds, políticas de retry/breaker/idempotency;
- adotar wrappers em novas funções;
- iniciar Wave 3B ou R5.

Ver `pre-production-freeze-register.md`.

---

## Ligação

- `hardening-backlog.md` — itens qualificados aqui.
- `hardening-tracking-board.md` — coluna Discovery espelha esta tabela.
- `pre-production-freeze-register.md` — o que **não** pode ser tocado durante o sprint.
- `reliability-runtime-RC-2-reframe.md` — motivo do HOLD.
