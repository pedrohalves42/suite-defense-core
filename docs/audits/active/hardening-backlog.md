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

Exemplos de categoria (preencher com IDs reais conforme forem
identificados):

- Isolamento entre tenants (RLS gap, cross-tenant read/write).
- Agente sem comunicação (heartbeat perdido, sem detecção).
- Perda de resultado (scan ou job).
- Falha de autenticação (login, MFA, sessão).
- Corrupção de dados (write parcial, escrita duplicada).
- Atualização de agente quebrada (rollback não funciona).

### Fila P0

| ID | Área | Impacto | Detecção | Owner | Status |
| --- | --- | --- | --- | --- | :-: |
| _(vazio — preencher)_ | | | | | |

---

## P1 — antes de escala

- Alertas inconsistentes ou ruidosos.
- Relatórios incompletos.
- Lentidão (p95/p99 acima do envelope).
- Logs insuficientes (sem `tenant_id` / `request_id` / `trace_id`).
- UX confusa em fluxos críticos.

### Fila P1

| ID | Área | Impacto | Detecção | Owner | Status |
| --- | --- | --- | --- | --- | :-: |
| _(vazio — preencher)_ | | | | | |

---

## P2 — pós-piloto

- Melhorias visuais.
- Automações extras.
- Novos módulos.

### Fila P2

| ID | Área | Impacto | Detecção | Owner | Status |
| --- | --- | --- | --- | --- | :-: |
| _(vazio — preencher)_ | | | | | |

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
