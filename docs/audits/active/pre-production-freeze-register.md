# Pre-Production Freeze Register

**Status:** ACTIVE
**Opened:** 2026-07-08
**Phase:** H — Hardening (pré-comercial)
**Owner:** Reliability Program (R1–R5)

---

## 1. Propósito

Registrar formalmente **tudo que está proibido de ser alterado** durante a fase de Hardening, entre a abertura da RC-2 como *Validation Gate* e o fechamento do primeiro tenant piloto controlado.

Este documento existe para evitar que uma **correção de bug** vire, por acidente, uma **alteração arquitetural** — o risco mais comum durante hardening pré-comercial.

Qualquer alteração em áreas marcadas como `Frozen` ou `Blocked` exige:

1. Justificativa escrita neste registro (seção 4).
2. Aprovação humana explícita (não basta code review).
3. Reabertura formal da wave correspondente OU exceção documentada com escopo, prazo e reversibilidade.

---

## 2. Áreas congeladas

| Área                                  | Estado    | Escopo do congelamento                                                                 |
| ------------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| Wave 3B                               | Blocked   | Nenhuma nova função entra no pipeline Reliability.                                     |
| Retry adoption                        | Frozen    | 2/74 permanece. Nenhuma nova função adota `withRetry`.                                 |
| Breaker                               | Frozen    | Configuração, thresholds e escopo inalterados.                                         |
| Idempotency                           | Frozen    | Chaves, TTL, storage e wrapper `withIdempotency` inalterados.                          |
| R5 Reliability Score                  | Blocked   | Sem cálculo, sem coleta, sem dashboard.                                                |
| Runtime primitives (`_shared/reliability/*`) | Frozen    | Nenhuma edição de código-fonte, incluindo refactors "sem efeito".                      |
| Wrapper changes (`composePipeline`, `withRetry`, `withBreaker`, `withIdempotency`) | Frozen    | Assinatura, ordem de composição e comportamento imutáveis.                             |
| Retry policies / backoff              | Frozen    | Jitter, base, cap, max attempts inalterados.                                           |
| Breaker thresholds                    | Frozen    | Failure ratio, half-open, cooldown inalterados.                                        |
| Observability schema (reliability)    | Frozen    | Campos, tags e nomes de métricas Reliability não mudam.                                |
| RC-2 evidence report                  | Append-only | Somente automação `reliability-rc2-close.ts` ou edição humana registrada pode escrever.|

---

## 3. O que **está permitido** durante o Hardening

Explicitar o permitido é tão importante quanto listar o proibido.

- Correções de bugs P0/P1 do `hardening-backlog.md`, **desde que não toquem** nas áreas da seção 2.
- Ajustes de UI, textos, i18n, mensagens de erro voltadas ao usuário.
- Correções de segurança em superfícies fora do runtime Reliability (auth, RLS, storage policies, CORS de funções não-envelopadas).
- Testes sintéticos do plano RC-2.1 (tráfego, injeção de falhas, medição).
- Documentação, runbooks, checklists.
- Automação read-only (window-check, close em `--dry-run`).
- Ajustes de billing, onboarding e compliance exigidos pelo Commercial Readiness Gate — desde que não alterem o runtime.

---

## 4. Exceções registradas

Nenhuma exceção aberta.

Formato para novas entradas:

```text
- Data:
- Área tocada:
- Motivo:
- Escopo (arquivos/linhas):
- Reversibilidade:
- Aprovador humano:
- Link para PR/commit:
- Data prevista de reversão (se temporária):
```

---

## 5. Critérios de encerramento deste registro

Este freeze só é dissolvido quando **todas** as condições abaixo forem satisfeitas:

1. `hardening-backlog.md` — zero P0 aberto e zero P1 bloqueador aberto.
2. `rc-2-1-synthetic-validation-plan.md` — matriz de cobertura 100% executada com evidência.
3. `commercial-readiness-gate.md` — todos os itens verdes.
4. `pilot-readiness-review.md` — checklist 100% verde.
5. Primeiro tenant piloto controlado onboarded e observado com carga real.
6. `reliability-rc2-evidence-report.md` — fechado formalmente com decisão `Promote` assinada.

Enquanto qualquer um dos 6 itens acima estiver pendente, este registro permanece **ACTIVE** e as áreas da seção 2 permanecem intocáveis.

---

## 6. Referências

- `docs/audits/active/r1-r5-consolidated-plan.md`
- `docs/audits/active/reliability-runtime-RC-2-reframe.md`
- `docs/audits/active/hardening-backlog.md`
- `docs/audits/active/rc-2-1-synthetic-validation-plan.md`
- `docs/audits/active/commercial-readiness-gate.md`
- `docs/audits/active/pilot-readiness-review.md`
- `docs/audits/active/reliability-rc2-evidence-report.md`
- `scripts/reliability-rc2-close.ts`
- `scripts/reliability-rc2-window-check.ts`
