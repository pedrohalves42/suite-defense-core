# Hardening Tracking Board — P0 & P1

Date: 2026-07-09
Owner: Reliability Program
Source of truth: `hardening-backlog.md`
Rule: nada fecha sem par de evidências **Antes / Depois** anexado.

**Fase atual:** `Hardening Execution — Sprint 1` (ver
`hardening-execution-sprint-1-kickoff.md`). Sprint 0 Discovery ✅ COMPLETE.
Item ativo: **P0-01** em `Investigation` (confidence **95% False Positive**)
— probe estrutural cobre 44/44 tabelas (RLS + `tenant_id` + policies).
Bloqueador único: rodar `tests/security/cross-tenant-rls.spec.ts` em CI
com dois usuários sintéticos. Bundle: `evidence/P0-01-rls/README.md`.

Este board rastreia execução, dependências, tipo do trabalho e prova
exigida para destravar o piloto. É consumido por:

- `rc-2-1-synthetic-validation-plan.md` (P0 = 0)
- `commercial-readiness-gate.md` (P1 aprovado)
- `pilot-readiness-review.md` (P0 = 0 e P1 = 0)

---

## Legenda

Status: ⬜ Open · 🟨 In Progress · 🟦 In Review · ✅ Closed · 🟥 Blocked · ♻ Reopened
Prio (interna ao P0): `Critical` > `High` > `Medium`
Tipo: `Defect` · `Security Control` · `Reliability Control` · `Operational Readiness`
Discovery (Sprint 0): `Pending` · `Confirmed` · `False Positive` · `Needs Investigation`

Gate de destravamento do piloto:

```text
P0: todos ✅   (com Discovery ∈ {Confirmed, False Positive fechado por evidência})
P1: todos ✅  (ou ≤3 ⬜/🟨 aceitos formalmente pelo Ops Lead)
```

---

## Grafo de dependências P0

```text
P0-01 RLS ─────────┬─────────────► P0-04 Auth/MFA ─────► P0-05 Idempotency ─► P0-03 Scan recovery
                   │                                                          │
                   └─► P0-09 Kill-switch                                       │
                                                                              ▼
                                                                        RC-2.1 Synthetic

P0-10 Secrets in logs          (independente, pode paralelizar)
P0-08 Backup/restore           (independente)
P0-07 Installer signing        (independente)
P0-02 Heartbeat ──► P0-06 Rollback
```

Regra: **não iniciar um item** enquanto suas dependências não estiverem `In Review` ou `Closed` — testar recuperação antes de garantir isolamento gera evidência inválida.

---

## Quadro P0

| ID | Prio | Tipo | Título | Depende | Discovery | Owner | Status | Evidência ANTES | Evidência DEPOIS | Local |
| --- | :-: | --- | --- | :-: | :-: | --- | :-: | --- | --- | --- |
| P0-01 | Critical | Security Control | RLS cross-tenant | — | Investigation (H1/H2/H3 = 0 unsafe; falta query cruzada) | Security Lead | 🟨 | Query cruzada mostra N>0 OU linter aponta tabela sem RLS | Query cruzada = 0 em todas tabelas + linter verde | `evidence/P0-01-rls/{investigation.md,before,after}.sql` |
| P0-10 | Critical | Security Control | Segredos em logs | — | False Positive (pendente 24h) | Security Lead | ⬜ | Grep em logs mostra N hits de token/service_role | Grep = 0 em 24h + scanner CI verde | `evidence/P0-10-secrets/{before,after}.md` |
| P0-04 | Critical | Security Control | Auth / MFA / step-up | P0-01 | Needs Investigation | Security Lead | ⬜ | e2e reproduz ação crítica sem MFA válido | Suite e2e 100% verde em CI (link do run) | `evidence/P0-04-auth-mfa/discovery.md` |
| P0-05 | High | Reliability Control | Escrita duplicada em jobs | P0-01, P0-04 | Needs Investigation | Reliability Lead | ⬜ | Reenvio 10× produz N>1 execuções materializadas | Reenvio 10× produz exatamente 1 execução | `evidence/P0-05-idempotency/discovery.md` |
| P0-03 | High | Defect | Perda de resultado de scan | P0-05 | Confirmed | Reliability Lead | ⬜ | Trace: scan `completed` com `findings = NULL` (job_id, hash) | Reprocess via idempotency-key → `findings` populados, hash idêntico ao esperado | `evidence/P0-03-scan-recovery/discovery.md` |
| P0-08 | High | Operational Readiness | Backup + restore verificado | — | Confirmed | Ops Lead | ⬜ | Nenhum restore documentado nos últimos 90 dias | Restore em ambiente isolado + smoke-test de 5 tabelas críticas verde, com timestamp | `evidence/P0-08-restore/{before,after}.md` |
| P0-02 | Medium | Defect | Heartbeat offline não detectado | — | Confirmed | Agent Lead | ⬜ | Agente parado 3× intervalo, nenhum alerta gerado | Mesma simulação → alerta em `agent_status` + evento em `audit_log` | `evidence/P0-02-heartbeat/discovery.md` |
| P0-06 | Medium | Defect | Rollback de update de agente | P0-02 | Needs Investigation | Agent Lead | ⬜ | Canário quebrado sem caminho de volta documentado | Rollback restaura 100% do canário em <5 min, log temporal anexo | `evidence/P0-06-rollback/discovery.md` |
| P0-07 | Medium | Security Control | Signing / integridade do installer | — | Needs Investigation | Security Lead | ⬜ | Discovery: verificar se existe manifest/assinatura/verificação hoje | Manifest HMAC-SHA256 verificado; hash alterado → recusa + `audit_log` | `evidence/P0-07-installer/discovery.md` |
| P0-09 | Medium | Operational Readiness | Kill-switch por tenant | P0-01 | Needs Investigation | Ops Lead | ⬜ | Nenhuma flag por tenant capaz de parar ingestão/jobs em <60s | Flag ativada desativa ingestão + jobs em <60s medidos + `audit_log` | `evidence/P0-09-kill-switch/discovery.md` |

Total P0: **10 abertos / 0 fechados / 10 classificados no Discovery** (Sprint 0 Days 1–3: 3 Confirmed · 1 False Positive pendente 24h · 5 Needs Investigation · 0 Pending) — RC-2.1 e piloto **BLOQUEADOS**.

---

## Quadro P1

| ID | Tipo | Título | Owner | Status | Evidência ANTES | Evidência DEPOIS | Local |
| --- | --- | --- | --- | :-: | --- | --- | --- |
| P1-01 | Reliability Control | Alertas ruidosos | Ops Lead | ⬜ | Taxa alerta/hora ≥5 em janela sintética | <5 alertas/hora em 72h + regra de dedup por `fingerprint` ativa | `evidence/P1-01-alerts/` |
| P1-02 | Reliability Control | Campos obrigatórios em logs | Reliability Lead | ⬜ | Amostra 200 logs → X% sem `tenant_id`/`request_id`/`trace_id` | Amostra 200 logs → 100% com os 3 campos | `evidence/P1-02-logs/` |
| P1-03 | Reliability Control | Envelope de latência | Reliability Lead | ⬜ | Baseline atual p95/p99 | Load test RC-2.1: p95<800ms, p99<2000ms nas rotas do envelope | `evidence/P1-03-latency/` |
| P1-04 | Defect | Qualidade do relatório de scan | Product Lead | ⬜ | Query mostra N findings com `severity`/`rule_id` nulos | Mesma query = 0 em 24h sintético | `evidence/P1-04-report/` |
| P1-05 | Defect | UX de erro em fluxos críticos | Product Lead | ⬜ | Playwright reproduz 6 telas sem ação clara | 6 telas com mensagem + ação + link de suporte | `evidence/P1-05-ux/` |
| P1-06 | Security Control | Rate limiting endpoints públicos | Security Lead | ⬜ | Sem limite hoje; teste passa acima de 100 req/min | 429 acima do limite confirmado por load test | `evidence/P1-06-ratelimit/` |
| P1-07 | Operational Readiness | Dashboard de saúde por tenant | Ops Lead | ⬜ | Sem visão por `tenant_id` | Dashboard com 3 tenants sintéticos + queries base | `evidence/P1-07-dashboard/` |
| P1-08 | Operational Readiness | Runbooks P0-01…P0-10 | Ops Lead | ⬜ | 0 runbooks publicados | 10 runbooks em `docs/runbooks/` linkados no alerta | `docs/runbooks/` |

Total P1: **8 abertos / 0 fechados**.

---

## Resumo executivo

```text
P0   ██████████  0 / 10   Discovery 0/10 confirmed   → RC-2.1 BLOCKED
P1   ████████    0 /  8                              → Commercial Readiness BLOCKED
P2   —           deferred / bloqueado pelo freeze

Freeze:              ACTIVE (pre-production-freeze-register.md)
Runtime primitives:  FROZEN
Wave 3B / R5:        BLOCKED
```

---

## Rotina de atualização

- Atualização mínima: **semanal** (segundas).
- Toda mudança de status referencia o ID em commit (`P0-05: In Progress`).
- Para passar a ✅ Closed, os dois arquivos **`before`** e **`after`** precisam existir no `Local`.
- Reabertura vira `P0-05-R1`, herda owner, exige nova evidência.

---

## Ligação

- `hardening-sprint-0-discovery.md` — precede este board: valida existência real de cada item.
- `hardening-backlog.md` — fonte da verdade dos itens.
- `pre-production-freeze-register.md` — o que **não** pode ser tocado.
- `rc-2-1-synthetic-validation-plan.md` — consome P0 = 0.
- `commercial-readiness-gate.md` — consome P1 aprovado.
- `pilot-readiness-review.md` — assinatura final requer P0 = 0 e P1 = 0.
