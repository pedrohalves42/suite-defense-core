# Hardening Backlog — pré-piloto

Date: 2026-07-07
Owner: engineering
Status: **OPEN** — bloqueia RC-2.1, Commercial Readiness Gate e primeiro piloto

Fila formal de bugs conhecidos que precisam ser fechados antes do
primeiro tenant real. Nenhuma expansão de Reliability (Wave 3B, R5,
Retry adicional, Breaker, Idempotency) é autorizada enquanto houver
item **P0 aberto**.

---

## Classificação

| Severidade | Critério | Bloqueia |
| --- | --- | --- |
| **P0** | quebra operação, risco de segurança, perda de dado, isolamento tenant | Piloto + RC-2.1 |
| **P1** | precisa antes de escala; alertas, performance, logs, UX | Commercial Readiness |
| **P2** | pós-piloto; melhorias visuais, automações extras, novos módulos | — |

---

## P0 — bloqueia piloto

Cada item tem owner nomeado, severidade justificada e critério de
aceitação **verificável** (comando, query ou artefato). Sem evidência,
o item **não fecha**.

### Fila P0

Campos adicionais:

- **Prio**: `Critical` > `High` > `Medium` — ordem operacional interna ao P0.
- **Tipo**: `Defect` (bug confirmado) / `Security Control` / `Reliability Control` / `Operational Readiness` (ausência de controle, não bug).
- **Depende de**: itens que devem ser fechados antes; testar fora de ordem gera evidência inválida.
- **Discovery**: estado no Hardening Sprint 0 (`Pending` / `Confirmed` / `False Positive` / `Needs Investigation`).

| ID | Prio | Tipo | Área | Depende de | Discovery | Owner | Status | Critério de aceitação |
| --- | :-: | --- | --- | :-: | :-: | --- | :-: | --- |
| P0-01 | Critical | Security Control | Isolamento tenant (RLS) | — | Pending | Security Lead | Open | `supabase--linter` verde + query cruzada `select count(*) from <t> where tenant_id <> get_active_tenant_id()` = 0 em toda tabela pública |
| P0-10 | Critical | Security Control | Segredos em logs / respostas | — | Pending | Security Lead | Open | `rg -n "service_role\|Bearer \|sk_"` em 24h de logs = 0 hits + scanner de segredos em CI verde |
| P0-04 | Critical | Security Control | Auth / MFA / step-up | P0-01 | Pending | Security Lead | Open | Suite e2e (login, refresh, step-up expirado, logout global) 100% verde |
| P0-05 | High | Reliability Control | Escrita duplicada em jobs | P0-01, P0-04 | Pending | Reliability Lead | Open | Reenvio 10× do mesmo `job_id` → 1 execução materializada (`count(*) group by job_id`) |
| P0-03 | High | Defect | Perda de resultado de scan | P0-05 | Pending | Reliability Lead | Open | Injeção de falha pós-upload → reprocess via idempotency → findings idênticos (hash antes/depois) |
| P0-08 | High | Operational Readiness | Backup + restore verificado | — | Pending | Ops Lead | Open | Restore em ambiente isolado + smoke-test de 5 tabelas críticas verde |
| P0-02 | Medium | Defect | Heartbeat / agente offline não detectado | — | Pending | Agent Lead | Open | Agente parado 3× intervalo → alerta em `agent_status` + evento em `audit_log` |
| P0-06 | Medium | Defect | Rollback de update de agente | P0-02 | Pending | Agent Lead | Open | Canário quebrado → rollback restaura 100% em <5 min, com log temporal |
| P0-07 | Medium | Security Control | Signing / integridade do installer | — | Pending | Security Lead | Open | Manifest HMAC-SHA256 verificado; teste com hash alterado **recusa** execução + `audit_log` |
| P0-09 | Medium | Operational Readiness | Kill-switch por tenant | P0-01 | Pending | Ops Lead | Open | Flag por tenant desativa ingestão + jobs em <60s, medido, com `audit_log` |

---

## P1 — antes de escala

### Fila P1

| ID | Área | Impacto | Owner | Status | Detecção |
| --- | --- | --- | --- | :-: | --- |
| P1-01 | Alertas ruidosos / duplicados | Fatiga de operação, incidente real perdido | Ops Lead | Open | Taxa alerta/hora <5 em 72h sintéticos; deduplicação por `fingerprint` |
| P1-02 | Observabilidade — `tenant_id` / `request_id` / `trace_id` obrigatórios | Impossível correlacionar incidente | Reliability Lead | Open | Amostra de 200 logs → 100% com os 3 campos populados |
| P1-03 | p95/p99 fora do envelope em rotas críticas | UX ruim, breaker pode disparar | Reliability Lead | Open | Load test RC-2.1: p95 < 800ms, p99 < 2000ms nas rotas do envelope |
| P1-04 | Relatório de scan incompleto (findings sem severidade/rule_id) | Cliente não confia no output | Product Lead | Open | Query de qualidade: 0 findings com campos obrigatórios nulos em 24h de tráfego sintético |
| P1-05 | UX de erro em fluxos críticos (upload, ativação de agente) | Cliente trava sem saber o que fazer | Product Lead | Open | Playwright cobre 6 fluxos de erro; cada tela mostra mensagem, ação e link de suporte |
| P1-06 | Rate limiting mínimo em endpoints públicos | Abuso trivial derruba serviço | Security Lead | Open | 100 req/min por IP em `/scan-virus`; teste de carga confirma HTTP 429 acima do limite |
| P1-07 | Cobertura de dashboard de saúde por tenant | Operação cega para tenant específico | Ops Lead | Open | Dashboard mostra jobs, erros, latência por `tenant_id`; validado com 3 tenants sintéticos |
| P1-08 | Runbook de incidente por categoria (P0-01…P0-10) | On-call sem playbook trava resposta | Ops Lead | Open | 10 runbooks publicados, revisados e linkados no alerta correspondente |

---

## P2 — pós-piloto

### Fila P2

| ID | Área | Impacto | Owner | Status |
| --- | --- | --- | --- | :-: |
| P2-01 | Melhorias visuais dashboard | Baixo | Product Lead | Deferred |
| P2-02 | Automações extras de resposta | Baixo | Ops Lead | Deferred |
| P2-03 | Novos módulos (Wave 3B, R5) | N/A — bloqueado por freeze | — | Blocked |

---

## Regras de manuseio

1. Todo item entra como `Open` com owner atribuído no mesmo dia.
2. `In Progress` requer PR aberto referenciando o ID.
3. `Closed` requer:
   - PR merged;
   - evidência de reprodução + fix (link no campo Detecção);
   - teste de regressão adicionado (unit ou e2e).
4. Reabertura conta como novo item com sufixo `-R<N>`.

---

## Gates de saída

- **Zero P0 abertos** → libera RC-2.1 Synthetic Validation.
- **P1 aberto ≤ 3** → libera Commercial Readiness Gate.
- **Todos os P1 fechados** → libera primeiro tenant piloto.
- P2 nunca bloqueia gates.

---

## Ligação com outros documentos

- `reliability-runtime-RC-2-reframe.md` — define Hold enquanto P0 > 0.
- `rc-2-1-synthetic-validation-plan.md` — só executa com P0 = 0.
- `commercial-readiness-gate.md` — item "Runtime sem erro crítico"
  espelha esta fila.
- `pilot-readiness-review.md` — assinatura final requer P0 = 0 e P1 = 0.
