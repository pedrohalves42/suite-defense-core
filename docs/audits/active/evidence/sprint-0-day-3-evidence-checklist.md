# Sprint 0 · Day 3 — Evidence Checklist (Reliability Dependent)

Date: 2026-07-09
Mode: **READ-ONLY** — nenhuma alteração de runtime, wrappers,
`_shared/reliability/*`, migrations, policies, flags ou edge functions.

## Escopo

Grupo C — 4 itens:

- P0-04 Auth / MFA / Step-up
- P0-05 Escrita duplicada / Idempotency
- P0-03 Recuperação de scan interrompido
- P0-09 Kill-switch global

## Ações permitidas

| Ação                                              | Permitida |
| ------------------------------------------------- | --------- |
| `rg` / grep em `src/`, `supabase/functions/`      | ✅        |
| Leitura de `database.types.ts` (tipos gerados)    | ✅        |
| Leitura de `docs/runbooks/` (listagem + conteúdo) | ✅        |
| Inspeção de `_shared/reliability/idempotency.ts`  | ✅ (read) |
| Enumerar callers de `isKillSwitchEnabled`         | ✅ (read) |
| Alterar qualquer arquivo em `_shared/reliability` | ❌        |
| Alterar edge function                             | ❌        |
| Alterar policy / GRANT / migration                | ❌        |
| Disparar kill-switch (`isKillSwitchEnabled`)      | ❌        |
| Executar scan real ou canário                     | ❌        |
| Rodar RPC destrutiva (batch, rollback, MFA reset) | ❌        |

## Critérios de classificação (aplicados)

| Estado                | Quando aplicar                                            |
| --------------------- | --------------------------------------------------------- |
| `False Positive`      | Controle existe, coberto por evidência estática/documental |
| `Needs Investigation` | Primitiva/superfície existe, cobertura server-side não comprovada |
| `Confirmed`           | Ausência total de controle ou gap verificável comprovado  |

## Guardas de freeze por item

### P0-04 Auth / MFA / Step-up

- Somente `rg` por `step_up|aal2|require_mfa` em `src/` e
  `supabase/functions/_shared`.
- Proibido: alterar `useStepUpAuth`, `useTenantMFAPolicy`, RPCs de
  auth, config de MFA no provider.

### P0-05 Idempotency

- Somente leitura de `_shared/reliability/idempotency.ts` e testes.
- Grep por callers e por coluna `idempotency_key` em tipos.
- Proibido: adicionar caller, alterar primitiva, criar coluna, tocar
  em pipeline/retry/breaker.

### P0-03 Scan Recovery

- Somente leitura de `scan-virus/` e `scan-vulnerabilities/`.
- Grep por `resume|recover|checkpoint`.
- Proibido: alterar retry policy, criar tabela de checkpoint,
  disparar scan real.

### P0-09 Kill-switch

- Somente leitura de `_shared/feature-flags.ts`, `system_kill_switch`
  em tipos, UI `RolloutPolicies`.
- Proibido: mudar flag, disparar toggle, alterar tabela, alterar
  `isKillSwitchEnabled`.

## Artefatos obrigatórios (Day 3)

| Artefato                                                        | Status |
| --------------------------------------------------------------- | ------ |
| `evidence/P0-04-auth-mfa/discovery.md`                          | ✅     |
| `evidence/P0-05-idempotency/discovery.md`                       | ✅     |
| `evidence/P0-03-scan-recovery/discovery.md`                     | ✅     |
| `evidence/P0-09-kill-switch/discovery.md`                       | ✅     |
| `evidence/sprint-0-day-3-checkpoint.md`                         | ✅     |
| `hardening-tracking-board.md` atualizado (coluna Discovery)     | ✅     |

## Auditoria de encerramento

- Runtime alterado: **0 linhas**
- `_shared/reliability/*`: **intocado**
- Wrappers / retry / breaker / idempotency: **intocados**
- Migrations / GRANTs / policies: **0 alterações**
- Kill-switch flags: **0 toggles**
- Scans reais disparados: **0**
- Freeze compliance: **PASS**
