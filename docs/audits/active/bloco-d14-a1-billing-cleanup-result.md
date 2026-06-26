# D14-A1 — Billing cleanup (resultado)

## Escopo
Remover `@ts-nocheck` dos 3 alvos críticos de billing sem alterar runtime,
contratos Stripe, mapeamento de plano/entitlement, ou uso de service_role.

## Arquivos alterados
| Arquivo | Diretivas removidas | Mudanças type-only |
| --- | ---: | --- |
| `supabase/functions/check-subscription/index.ts` | 1 | nenhuma — arquivo já era type-clean sob a tipagem do `serveTenant` |
| `supabase/functions/create-checkout/index.ts` | 1 | nenhuma — schema Zod fornecia narrowing suficiente |
| `supabase/functions/api-gateway/handlers/billing.ts` | 1 | nenhuma — uso interno de `SB = any` permanece (compatível com `HandlerContext`) |

## Inventário inicial (D14-A1.0)
- 3 diretivas `@ts-nocheck` ativas (uma por arquivo). 0 outras menções.
- Referências preservadas: `service_role`, `SERVICE_ROLE_KEY`, `createClient`,
  `stripe.customers.list`, `stripe.subscriptions.list`,
  `stripe.checkout.sessions.create`, `stripe_plan_mapping`,
  `tenant_subscriptions`, `subscription_plans`, `custom_trials`,
  `tenant_features`, `audit_logs`.

## Erros iniciais `deno check` por alvo
- `check-subscription/index.ts`: **0 erros próprios** após remoção.
- `create-checkout/index.ts`: **0 erros próprios** após remoção.
- `api-gateway/handlers/billing.ts`: **0 erros próprios** após remoção.

## Stripe / billing preservados
- `priceId`, `customer`, `customer_email`, `line_items`, `mode: 'subscription'`,
  `success_url`/`cancel_url`, `metadata.tenant_id/user_id/plan_name/max_devices`:
  intactos.
- Resolução de plano via `stripe_plan_mapping` (price_id → logical_plan,
  base_devices): intacta.
- Sync para `tenant_subscriptions` (plan_id, stripe_customer_id,
  stripe_subscription_id, status, current_period_end): intacto.
- Fallback `{ subscribed: false, plan: 'free' }` quando sem customer ou
  subscription ativa: intacto.
- `apiVersion: '2025-08-27.basil'`, `timeout: 10_000`, `Stripe.createFetchHttpClient()`:
  intactos.

## service_role preservado, não ampliado
- `billing.ts` segue invocando `notification-router` / `cleanup-router` via
  `SUPABASE_SERVICE_ROLE_KEY` apenas nos pontos existentes
  (`handleCheckTrialExpiration`, `handleSecurityCleanup`).
- Nenhum novo uso de service_role introduzido.

## Audit log
- **`check-subscription`**: ausente. Sync de subscription sem audit log.
  Finding registrado, **não corrigido** (fora do escopo D14-A1).
- **`create-checkout`**: ausente. Criação de sessão Stripe sem audit log.
  Finding registrado, **não corrigido**.
- **`billing.ts`**:
  - `handleSubscriptionAnalytics` lê `audit_logs` para métricas (intacto).
  - `handleCreateCustomTrial`, `handleCreateTrialSubscription`,
    `handleSendTrialReminder`, `handleSalesPipeline` (create/update/delete):
    **sem `createAuditLog`**. Operações sensíveis (criação de usuário,
    mutação de pipeline, envio de email transacional) ficam sem rastro
    centralizado. Finding registrado, **não corrigido**.

## Consumers validados
- `api-gateway/handlers/billing.ts` é consumido por `api-gateway/index.ts` e
  por `api-gateway/handlers/billing-v2.ts` (re-export de
  `handleUnitEconomics`). Nenhum break de contrato.
- `check-subscription` e `create-checkout` são entry-points (`serveTenant`)
  invocados via `supabase.functions.invoke`. Contratos JSON inalterados.

## Gate expandido
`scripts/guard-no-ts-nocheck-tier1.sh` ampliado de 36 → **39 arquivos**
protegidos. PASS confirmado.

## Riscos residuais
1. **Regressão em `_shared/` detectada (fora do escopo D14-A1):**
   `deno check` na trilha transitiva de `_shared/agent-auth.ts:255` e
   `_shared/serve-agent.ts:119` reporta 2 erros (TS2352, TS2339) que
   passaram pelo D12 — provavelmente porque o `deno check` direto naqueles
   arquivos não foi executado isoladamente após a última iteração de
   `AgentAuthResult`. Os 3 alvos D14-A1 não introduzem esses erros e não
   compartilham linhas com eles. **Recomendação**: abrir hotfix
   `HF-SHARED-RECOVER-01` para reconciliar a união discriminada
   `AgentAuthResult` e o cast `TokenWithAgent`.
2. **Ausência de audit log** nos handlers de billing listados acima
   (criação de trial customizado, deals, lembretes de trial, sync de
   assinatura, checkout). Justifica um bloco dedicado
   `BILLING-AUDIT-01`.
3. **`SB = any`** em `billing.ts` continua sendo a porta de entrada para
   drift futuro. Manter, mas marcar para refatoração quando `HandlerContext`
   for tipado com `SupabaseClient<Database>`.

## Próximo alvo
**D14-A2 — auth/identity**:
`admin-auth`, `enrollment`, `fido2-register`, `enroll-agent`,
`auto-generate-enrollment`.
