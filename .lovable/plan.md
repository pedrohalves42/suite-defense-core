
# Plano: Revisão de Preços e Modelo de Receita

## Diagnóstico Atual

### Estado do Banco de Dados:
- **16 tenants**, todos no tier `free`
- **0 stripe_customer_id** em qualquer tenant_subscription
- **0 subscriptions ativas pagas** — nenhuma conversão real
- **subscription_plans**: 16 planos cadastrados, mas apenas `free` e `enterprise` estão `is_active = true`. Todos os outros (`starter`, `pro`, `business`, residenciais) estão `is_active = false`
- **stripe_plan_mapping**: 4 registros ativos (starter_compliance R$249/mês base, business R$599/mês base, + addons)

### Estado do Stripe:
- **10 produtos** criados (Starter mensal/semestral/anual, Business mensal/semestral/anual, addons, versões antigas)
- **Preço Starter Mensal**: R$499 (price_1T9ltDFeHfNScQDPDCs2evWV no prod_U81x6fHQIeM2B8)
- Mapeamento no `stripe_plan_mapping` usa preços diferentes (price_1Sj531... = R$249) — **INCONSISTÊNCIA**

### Frontend:
- ✅ `create-checkout`, `check-subscription`, `customer-portal` já implementados (standalone + api-gateway)
- ✅ `UpgradeModal`, `PlanUpgradeNew`, `useSubscription` hook existem
- ❌ Nenhuma barreira real impede uso do free (3 agentes, scans ilimitados implicitamente)
- ❌ Planos pagos desativados (`is_active = false`) — checkout não funciona

### Raiz do Problema:
1. **Planos pagos estão desativados** no banco (`is_active = false`)
2. **Inconsistência de preços** entre `subscription_plans` e `stripe_plan_mapping`
3. **Sem enforcement de limites** — free permite mais do que deveria
4. **Trial sem expiração efetiva** — não bloqueia funcionalidades ao expirar

---

## Fase 1: Ativar e alinhar planos (DB)

### 1a. Limpar e ativar planos corretos
- Atualizar `subscription_plans`: ativar `starter` (R$499, 10 devices) e `business` (R$899, 30 devices)
- Ajustar `free`: max_agents=2, max_devices=2
- Desativar planos residenciais/legados

### 1b. Alinhar stripe_plan_mapping com preços Stripe atuais
- Atualizar `stripe_plan_mapping` para apontar para os price IDs corretos dos produtos novos (prod_U81x*)

### 1c. Criar preços Stripe para Business mensal se não existir
- Verificar se já existe price mensal para o produto Business novo

---

## Fase 2: Enforcement de limites do plano free

### 2a. Edge function de enforcement
- No `check-subscription` e nas operações de criação de agente, verificar limites do plano
- Se free: max 2 agentes, 7 dias de retenção de logs

### 2b. Frontend — Banner de upgrade
- Mostrar banner/modal quando tenant free atinge 80% do limite de agentes
- Bloquear criação de agente quando limite atingido

---

## Fase 3: Trial com conversão

### 3a. Trial de 14 dias para planos pagos
- Ao fazer checkout, Stripe cria subscription com `trial_period_days: 14`
- Cartão obrigatório no checkout (comportamento padrão do Stripe Checkout)

### 3b. Expiração de trial
- `check-subscription` já verifica `trial_end` — garantir que retorna `subscribed: false` após expiração

---

## Fase 4: Enterprise sob consulta

- Plano enterprise mantém `is_sales_only = true` e `is_public = false`
- Landing page mostra "Fale com vendas" em vez de botão de checkout
- Já existe no BD, apenas garantir que não aparece no checkout público

---

## Validação Final:
- ✅ Starter e Business ativados e vinculados ao Stripe
- ✅ Free limitado a 2 agentes
- ✅ Checkout redireciona para Stripe com preços corretos
- ✅ Trial de 14 dias com cartão obrigatório
- ✅ Enterprise sob consulta
- ✅ Zero impacto nos tenants existentes (todos free, sem downgrade)
