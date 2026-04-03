
# Plano: Integração Stripe Checkout — Diagnóstico e Ações

## ✅ O que JÁ EXISTE (não precisa criar)

| Componente | Status | Local |
|---|---|---|
| Tabela `tenant_subscriptions` | ✅ Existe | 15 colunas incluindo `stripe_customer_id`, `stripe_subscription_id`, `status`, `trial_end`, `current_period_end` |
| Tabela `subscription_plans` | ✅ Existe | 6 planos ativos (free, starter, pro, enterprise + 2 addons) com `stripe_price_id` |
| Tabela `subscription_events` | ✅ Existe | Auditoria completa de eventos |
| `create-checkout` handler | ✅ Existe | `api-gateway/handlers/billing-stripe.ts` — cria sessão Stripe com trial 14 dias, suporta addons e cupons MSP |
| `check-subscription` handler | ✅ Existe | `api-gateway/handlers/billing-stripe.ts` + edge function standalone |
| `customer-portal` handler | ✅ Existe | `api-gateway/handlers/billing-stripe.ts` |
| `manage-subscription` handler | ✅ Existe | Upgrade/downgrade entre planos |
| `stripe-webhook` edge function | ✅ Existe | Handlers: checkout.completed, subscription.created/updated/deleted, trial_will_end, payment_failed |
| Webhook event handlers | ✅ Existe | `event-handlers.ts` — sync tenant_subscriptions, auditoria, downgrade automático para free |
| Frontend: PlanUpgrade page | ✅ Existe | `src/pages/admin/PlanUpgradeNew/` com seleção de plano e checkout |
| Frontend: UpgradeModal | ✅ Existe | `src/components/UpgradeModal.tsx` |
| Frontend: CheckoutSuccess/Cancel | ✅ Existe | Páginas de retorno do Stripe |
| Frontend: useSubscription hook | ✅ Existe | Polling a cada 10min via gateway |
| Secrets configurados | ✅ | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Produtos no Stripe | ✅ | 10 produtos com prices em BRL (Starter R$499, Business R$899, addons, períodos variados) |

## 🔍 Gap: Nenhum tenant tem `stripe_customer_id` ou `stripe_subscription_id` preenchido

Todos os 10 tenants consultados têm `stripe_customer_id: null` — indica que **nenhum checkout foi completado com sucesso** ainda. Isso pode significar:
1. O webhook não está recebendo eventos (URL incorreta no Stripe Dashboard)
2. O webhook está falhando silenciosamente
3. Ninguém fez checkout ainda (cenário legítimo em fase de testes)

## Ações Necessárias

### 1. Verificar configuração do Webhook no Stripe
- Confirmar que o endpoint `https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/stripe-webhook` está configurado no Stripe Dashboard
- Verificar se os eventos corretos estão habilitados: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`

### 2. Teste end-to-end do fluxo
- Criar checkout via `callGateway('billing', 'create-checkout', { planName: 'starter_compliance' })`
- Verificar se a sessão Stripe é criada corretamente
- Usar cartão de teste do Stripe para completar pagamento
- Verificar se o webhook atualiza `tenant_subscriptions`

### 3. (Opcional) Sincronizar nomes de plano
- O handler `create-checkout` aceita `starter_compliance` e `business`
- Mas a tabela `subscription_plans` tem `starter` e `pro` como nomes
- Verificar se o mapeamento está correto no `stripe_plan_mapping`

## Resultado
A integração Stripe Checkout **já está 95% completa**. O trabalho restante é validação e teste, não implementação.
