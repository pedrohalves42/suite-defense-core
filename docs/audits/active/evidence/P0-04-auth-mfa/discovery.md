# P0-04 — Auth / MFA / Step-up · Discovery Note (Sprint 0 · Day 3)

- Date: 2026-07-09
- Owner: Security Lead
- Mode: read-only inspection
- Depends on: P0-01 (RLS)

## Classificação

**Confirmed (Sprint 1A · 2026-07-10).**

A investigação de Sprint 1A confirmou o gap. O único ponto server-side
com "step-up enforcement" (`supabase/functions/api-gateway/handlers/honeypot.ts`,
2 handlers) baseia a decisão em um header HTTP arbitrário
(`X-Step-Up-Verified: true`) — bypass trivial via `curl`. Todos os
demais endpoints destrutivos enumerados em `before.md` não têm
qualquer checagem de AAL2/step-up. Detalhes completos, PoC e lista
de endpoints em `./before.md`. Correção runtime em Frente 2.

## Evidência coletada

### Frontend

- `src/hooks/useStepUpAuth.tsx` — hook de step-up com verificação
  MFA antes de ações críticas (log observado: "Requiring step-up
  verification").
- `src/hooks/useTenantMFAPolicy.tsx` — política por tenant:
  `require_mfa_all_users`, `require_mfa_roles` (default:
  `['admin', 'super_admin']`).
- `src/components/security/StepUpAuthWrapper.tsx` — render-prop
  wrapper para injetar step-up em children.
- `src/components/fleet/BatchActionBar.tsx` — batch actions
  envolvidas por step-up + dialog MFA.
- `src/components/auth/useLoginFlow.ts` — tratamento de
  `mfa_required` no login.

### Server-side (gap)

- Nenhum grep direto por `aal2`, `assurance_level` ou
  verificação de MFA em edge functions retornou hits significativos
  em `_shared/` (fora de tipos gerados).
- **Não comprovado**: RPCs destrutivas (batch actions, kill-switch,
  rollback de update) exigem AAL2 no servidor. Se a checagem for
  apenas client-side, é bypass trivial via curl direto.

## Sinais numéricos

| Sinal                                          | Valor |
| ---------------------------------------------- | ----- |
| Hooks/componentes de step-up (frontend)        | 3     |
| Política MFA por tenant                        | sim   |
| Enforcement server-side (AAL2) comprovada       | não (não localizada) |
| RPCs sensíveis auditadas contra AAL2           | 0     |

## Guarda de freeze respeitada

- Nenhuma edge function, RPC, policy ou hook alterado.
- Nenhuma configuração de auth alterada.
- Apenas leitura de código e busca por padrões.

## Próximo passo (fora do Sprint 0)

1. Spike 0.5d: enumerar RPCs destrutivas (rollback, batch, kill-switch,
   MFA reset, break-glass) e verificar se cada uma exige AAL2/step-up
   no servidor (ex.: `auth.jwt() ->> 'aal' = 'aal2'`).
2. Se ausente em qualquer uma → reabrir como `Confirmed` P0 Fix
   Execution.
3. Se todas presentes → `False Positive` com evidência.

Dependência bloqueante: P0-01 (triagem de `SECURITY DEFINER` expostos
pode revelar rotas que ignoram AAL2).
