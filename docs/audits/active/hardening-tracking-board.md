# Hardening Tracking Board — P0 & P1

Date: 2026-07-08
Owner: Reliability Program
Source of truth: `hardening-backlog.md`
Purpose: rastrear execução, responsável e **evidência exigida** para
destravar o piloto. Uma linha por item. Nada fecha sem evidência anexada.

Este quadro **não substitui** o backlog — espelha-o com foco em
status operacional e artefatos de prova.

---

## Legenda de status

| Símbolo | Significado |
| :-: | --- |
| ⬜ | Open — não iniciado |
| 🟨 | In Progress — PR aberto |
| 🟦 | In Review — PR merged, aguardando evidência |
| ✅ | Closed — evidência aceita |
| 🟥 | Blocked — dependência externa |
| ♻ | Reopened — sufixo `-R<N>` |

Gate de destravamento do piloto:

```text
P0: todos ✅
P1: todos ✅ (ou ≤3 ⬜/🟨 explicitamente aceitos pelo Ops Lead)
```

---

## Quadro P0 — bloqueia RC-2.1 e piloto

| ID | Título | Owner | Status | Evidência exigida | Local da evidência | Data alvo |
| --- | --- | --- | :-: | --- | --- | --- |
| P0-01 | RLS cross-tenant | Security Lead | ⬜ | `supabase--linter` verde + query cross-tenant retorna 0 em todas tabelas públicas | `docs/audits/active/evidence/P0-01-rls.sql` + screenshot linter | — |
| P0-02 | Heartbeat offline não detectado | Agent Lead | ⬜ | Log de simulação (agente parado 3× intervalo) + alerta em `agent_status` + entrada em `audit_log` | `docs/audits/active/evidence/P0-02-heartbeat.md` | — |
| P0-03 | Perda de resultado de scan | Reliability Lead | ⬜ | Trace de reprocessamento via idempotency-key com findings idênticos antes/depois | `docs/audits/active/evidence/P0-03-scan-loss.md` | — |
| P0-04 | Auth / MFA / step-up | Security Lead | ⬜ | Suite e2e (login, refresh, step-up expirado, logout global) 100% verde em CI | Link do run CI + relatório Playwright | — |
| P0-05 | Escrita duplicada em jobs | Reliability Lead | ⬜ | Reenvio 10× do mesmo `job_id` → 1 execução materializada (query anexa) | `docs/audits/active/evidence/P0-05-idempotency.sql` | — |
| P0-06 | Rollback de update de agente | Agent Lead | ⬜ | Canário quebrado + rollback restaurando 100% em <5 min, log temporal | `docs/audits/active/evidence/P0-06-rollback.md` | — |
| P0-07 | Integridade do installer | Security Lead | ⬜ | Teste de manifest adulterado recusado + entrada em `audit_log` | `docs/audits/active/evidence/P0-07-installer.md` | — |
| P0-08 | Backup + restore verificado | Ops Lead | ⬜ | Restore em ambiente isolado + smoke-test de 5 tabelas críticas verde | `docs/audits/active/evidence/P0-08-restore.md` | — |
| P0-09 | Kill-switch por tenant | Ops Lead | ⬜ | Ativação de flag desativa ingestão+jobs em <60s, medido | `docs/audits/active/evidence/P0-09-killswitch.md` | — |
| P0-10 | Segredos em logs | Security Lead | ⬜ | Scan `rg` em 24h de logs = 0 hits + scanner CI verde | `docs/audits/active/evidence/P0-10-secrets.md` | — |

Total P0: **10 abertos / 0 fechados** — RC-2.1 e piloto **BLOQUEADOS**.

---

## Quadro P1 — bloqueia Commercial Readiness

| ID | Título | Owner | Status | Evidência exigida | Local da evidência | Data alvo |
| --- | --- | --- | :-: | --- | --- | --- |
| P1-01 | Alertas ruidosos | Ops Lead | ⬜ | Métrica alerta/hora <5 em janela 72h sintética + regra de dedup ativa | `docs/audits/active/evidence/P1-01-alerts.md` | — |
| P1-02 | Campos obrigatórios em logs | Reliability Lead | ⬜ | Amostra 200 logs, 100% com `tenant_id` + `request_id` + `trace_id` | `docs/audits/active/evidence/P1-02-logs.md` | — |
| P1-03 | Envelope de latência | Reliability Lead | ⬜ | Load test RC-2.1: p95 <800ms, p99 <2000ms nas rotas do envelope | Relatório RC-2.1 + gráficos | — |
| P1-04 | Qualidade do relatório de scan | Product Lead | ⬜ | Query: 0 findings com `severity`/`rule_id` nulos em 24h sintético | `docs/audits/active/evidence/P1-04-report.sql` | — |
| P1-05 | UX de erro em fluxos críticos | Product Lead | ⬜ | Playwright cobre 6 telas de erro com ação + link de suporte | Run Playwright + screenshots | — |
| P1-06 | Rate limiting endpoints públicos | Security Lead | ⬜ | Load test confirma 429 acima de 100 req/min/IP | `docs/audits/active/evidence/P1-06-ratelimit.md` | — |
| P1-07 | Dashboard de saúde por tenant | Ops Lead | ⬜ | Screenshot com 3 tenants sintéticos + queries base | `docs/audits/active/evidence/P1-07-dashboard.md` | — |
| P1-08 | Runbooks P0-01…P0-10 | Ops Lead | ⬜ | 10 runbooks publicados + linkados no alerta correspondente | `docs/runbooks/` | — |

Total P1: **8 abertos / 0 fechados**.

---

## Resumo executivo

```text
P0   ██████████  0 / 10   → RC-2.1 BLOCKED, piloto BLOCKED
P1   ████████    0 /  8   → Commercial Readiness BLOCKED
P2   —           deferred / bloqueado por freeze

Freeze:              ACTIVE (pre-production-freeze-register.md)
Runtime primitives:  FROZEN
Wave 3B / R5:        BLOCKED
```

---

## Rotina de atualização

- Atualização mínima: **semanal** (segundas).
- Cada mudança de status exige commit referenciando o ID (`P0-05: In Progress`).
- Ao passar para ✅ Closed, o arquivo de evidência **precisa existir** — CI vai validar (a criar em Fase H+1).
- Reabertura vira `P0-05-R1`, herda owner, nova evidência obrigatória.

---

## Ligação

- `hardening-backlog.md` — fonte da verdade dos itens.
- `pre-production-freeze-register.md` — o que **não** pode ser tocado durante a correção.
- `rc-2-1-synthetic-validation-plan.md` — consome P0 = 0 como pré-condição.
- `commercial-readiness-gate.md` — consome P1 = 0 (ou aceite formal ≤3).
- `pilot-readiness-review.md` — assinatura final requer P0 = 0 **e** P1 = 0.
