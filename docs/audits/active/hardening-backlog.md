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

| ID | Área | Impacto | Owner | Status | Detecção |
| --- | --- | --- | --- | :-: | --- |
| P0-01 | Isolamento tenant (RLS) | Cross-tenant read/write compromete confidencialidade e contrato SLA | Security Lead | Open | Auditoria `supabase--linter` + query cruzada `select count(*) from <tabela> where tenant_id <> get_active_tenant_id()` retorna 0 em toda tabela pública |
| P0-02 | Heartbeat / agente offline não detectado | Cliente crê que endpoint está protegido quando não está | Agent Lead | Open | Simular agente parado 3× intervalo → alerta gerado em `agent_status` + evento em `audit_log` |
| P0-03 | Perda de resultado de scan | Scan aparece "concluído" sem persistir findings | Reliability Lead | Open | Injetar falha pós-upload no `scan-virus`; job deve reprocessar via idempotency e produzir findings idênticos |
| P0-04 | Auth / MFA / step-up | Ação crítica executada sem MFA válido dentro dos 5 min | Security Lead | Open | Suite e2e cobrindo login, refresh, step-up expirado, logout global; 100% verde |
| P0-05 | Corrupção por escrita duplicada em jobs | Duplo processamento gera billing/telemetria inflados | Reliability Lead | Open | Reenviar mesmo `job_id` 10× → exatamente 1 execução materializada (`select count(*) group by job_id`) |
| P0-06 | Rollback de atualização de agente | Update quebrado deixa frota inoperante sem volta | Agent Lead | Open | Deploy canário → forçar falha → comando rollback restaura versão anterior em <5 min em 100% do canário |
| P0-07 | Signing / integridade do installer | Installer adulterado poderia executar em endpoint cliente | Security Lead | Open | Manifest assinado HMAC-SHA256 verificado; teste com hash alterado deve **recusar** execução e logar em `audit_log` |
| P0-08 | Backup + restore verificado | Restore nunca testado = backup teórico | Ops Lead | Open | Restore em ambiente isolado a partir do último snapshot; smoke-test de leitura de 5 tabelas críticas passa |
| P0-09 | Kill-switch por tenant | Sem forma de parar rápido um tenant problemático | Ops Lead | Open | Feature flag por tenant desativa ingestão + jobs em <60s; evento em `audit_log` |
| P0-10 | Segredos em logs / respostas | Vazamento de token/SERVICE_ROLE nos logs | Security Lead | Open | `rg -n "service_role\|Bearer \|sk_"` em logs de 24h retorna zero; scanner de segredos em CI verde |

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
