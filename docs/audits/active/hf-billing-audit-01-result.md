# HF-BILLING-AUDIT-01 — Resultado

**Status:** ✅ Concluído
**Escopo:** Fechar a lacuna de auditoria identificada no D14-A1, instrumentando
`createAuditLog` consistente em operações sensíveis de billing.

## Pré-requisito

Consome o contrato widened em **HF-AUDIT-CONTRACT-01** (`userId` opcional em
`_shared/audit.ts`). Nenhuma alteração adicional no helper foi necessária.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/api-gateway/handlers/billing.ts` | Import de `createAuditLog`; audit em `handleCreateTrialSubscription` e `handleCreateCustomTrial` |
| `supabase/functions/api-gateway/handlers/billing-stripe.ts` | Import; audit em `handleCustomerPortal`, `handleCreateCheckout`, `handleManageSubscription` (cobrindo upgrade/add_devices/downgrade/cancel) |
| `supabase/functions/create-checkout/index.ts` | Import; audit pós-criação da sessão |
| `supabase/functions/check-subscription/index.ts` | Import; audit pós-sync de subscription |

## Eventos instrumentados

Todos com `success: true`, payloads **sanitizados**:

| `action` | Resource | Detalhes registrados |
|---|---|---|
| `billing.trial_created` | `tenant_subscription` | plan, trial_days, trial_end, request_id |
| `billing.custom_trial_created` | `custom_trial` | plan, trial_days, trial_end, company_name, **email_domain** (não o email completo), device_quantity, request_id |
| `billing.customer_portal_session_created` | `tenant_subscription` | billing_period, request_id |
| `billing.checkout_session_created` (gateway) | `checkout_session` (Stripe session id) | plan_name, base_devices, extra_devices, total_devices, trial_period_days, request_id |
| `billing.checkout_session_created` (standalone) | `checkout_session` | plan_name, max_devices, request_id |
| `billing.subscription_upgrade` / `_add_devices` / `_downgrade` / `_cancel` | `tenant_subscription` (Stripe sub id) | operation, target_plan, extra_devices, previous_plan, request_id |
| `billing.subscription_synced` | `tenant_subscription` | plan_name, status, current_period_end, request_id |

## Garantias (proibições do escopo)

❌ Não persistidos em nenhum audit log:
- Stripe secret key, `STRIPE_SECRET_KEY`, qualquer secret
- Webhook payload completo
- URLs de checkout/portal (apenas IDs de sessão)
- PAN, dados de cartão, métodos de pagamento
- Headers de autenticação
- Email completo em fluxos administrativos (apenas domínio)
- Token, refresh token, cookies

## Garantias funcionais (preservadas)

- ✅ Fluxo Stripe inalterado (nenhum parâmetro de `subscriptions.update`,
  `checkout.sessions.create`, `customers.list` foi tocado)
- ✅ Idempotência preservada (audit é fire-and-forget e silent-fail dentro de
  `createAuditLog`)
- ✅ Status HTTP idênticos
- ✅ Contratos de resposta idênticos
- ✅ Retry, tratamento de erros e permissões intocados
- ✅ Tenant binding mantido — `tenantId` vem de `ctx`, nunca de payload

## Item absorvido (sliver de API-GATEWAY-DRIFT-01)

Durante o `deno check` foi exposto um drift pré-existente:
`billing-stripe.ts` chama `stripe.prices.retrieve(id)` (linha 670) mas o
contrato local mínimo de `StripeInstance` não declarava `prices.retrieve`.

**Decisão:** o autor incluiu o fix mínimo (uma linha — assinatura
`retrieve(id): Promise<{ product: string | unknown }>`) por ser do mesmo
domínio e mesma criticidade, conforme cláusula do escopo
("se durante a implementação surgir outro handler de billing equivalente").
Resto do API-GATEWAY-DRIFT-01 segue para D14-A4.

## Validação

- `deno check` em todos os 4 arquivos: ✅ **PASS**
- Runtime alterações: **nenhuma** (apenas inserções de side-effect audit
  após o ponto de sucesso)
- Contratos HTTP: **idênticos**
- Gates CI: a sequência já saneada (D14-A1) mantém os 39 arquivos protegidos;
  guarda não regrediu.

## Próximo bloco

**D14-A4 — Public / Release / Signing**
- register-agent-release, sign-release, promote-agent-v5
- security-*, agent-ops
- api-gateway handlers restantes (absorve restante de API-GATEWAY-DRIFT-01)
