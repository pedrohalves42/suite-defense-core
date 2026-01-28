
Objetivo
- Corrigir definitivamente o erro 500 ao criar nova conta (POST /auth/v1/signup) que está impedindo o signup.

Diagnóstico (baseado em evidência real)
- O erro atual é: `duplicate key value violates unique constraint "tenant_subscriptions_tenant_id_key" (SQLSTATE 23505)`.
- Isso acontece dentro do fluxo de signup porque há duas rotas criando a assinatura do mesmo tenant:
  1) Trigger em `public.tenants` chamado `create_tenant_subscription` (função `public.create_default_subscription`) que faz:
     - `INSERT INTO public.tenant_subscriptions (tenant_id, plan_id) VALUES (NEW.id, free_plan_id);`
  2) Trigger `public.handle_new_user()` (AFTER INSERT em `auth.users`) que após criar o tenant também tenta:
     - `INSERT INTO public.tenant_subscriptions (...) SELECT ... WHERE name='free' ...;`
- Como `tenant_subscriptions.tenant_id` é UNIQUE, o segundo INSERT aborta a transação e o signup vira 500.

Solução proposta (robusta e “à prova de duplicidade”)
Ajustar o trigger `public.handle_new_user()` para ser idempotente e compatível com o trigger existente em `public.tenants`.

Mudança principal (obrigatória)
- Substituir o trecho que faz INSERT direto em `tenant_subscriptions` por UPSERT:
  - `INSERT ... ON CONFLICT (tenant_id) DO UPDATE`
  - Assim, se a assinatura já foi criada pelo trigger `create_tenant_subscription`, o `handle_new_user()` apenas atualiza a assinatura para:
    - `status = 'trialing'`
    - `trial_end = now() + interval '14 days'`
    - `current_period_end = now() + interval '14 days'`
    - `device_quantity = 1` (mantendo o padrão atual; podemos evoluir depois para respeitar o “Quantos computadores…”)

Hardening opcional (recomendado)
- Tornar também o trigger `public.create_default_subscription()` tolerante a duplicidade para cenários futuros:
  - `INSERT ... ON CONFLICT (tenant_id) DO NOTHING`
  - Isso cria “dupla proteção” e evita que qualquer alteração futura volte a quebrar signup por 23505.

Implementação (o que será feito no código do projeto)
1) Criar uma nova migration SQL que:
   1.1) `CREATE OR REPLACE FUNCTION public.handle_new_user()` com a alteração do bloco de assinatura para UPSERT.
   1.2) (Opcional) `CREATE OR REPLACE FUNCTION public.create_default_subscription()` com `ON CONFLICT DO NOTHING`.
   1.3) Não altera tabelas nem dados históricos; apenas corrige a lógica do onboarding.

2) Garantir compatibilidade com o estado atual do schema:
   - `tenant_subscriptions` tem colunas e defaults adequados (`status` default 'active', `device_quantity` default 1). O UPSERT vai forçar para trialing e setar datas.

3) Publicação/propagação:
   - Aplicar a migration no ambiente de teste.
   - Publicar para levar a correção ao ambiente live (onde seu domínio está criando contas).

Validação (checklist objetivo)
A) Teste funcional end-to-end
- Criar uma conta com um email nunca usado.
- Confirmar que o POST /auth/v1/signup retorna 200 (sem 500).
- Confirmar que o app redireciona para o dashboard/onboarding.

B) Verificação no banco (queries de verificação)
- Confirmar que o tenant recém-criado tem exatamente 1 subscription:
  - `SELECT tenant_id, count(*) FROM tenant_subscriptions GROUP BY tenant_id HAVING count(*) > 1;` (deve retornar zero linhas)
- Confirmar que a subscription do novo tenant está em trial:
  - `SELECT tenant_id, status, trial_end, current_period_end, device_quantity FROM tenant_subscriptions ORDER BY created_at DESC LIMIT 5;`

C) Observabilidade
- Revalidar logs: não deve haver mais SQLSTATE 23505 em signup.

Riscos e mitigação
- Risco: plano ‘free’ não existir (plan_id nulo) faria o UPSERT falhar por NOT NULL.
  - Mitigação: na função, buscar explicitamente o `free_plan_id` e lançar erro claro caso não exista (para não ficar “500 genérico” sem causa).
- Risco: mudanças futuras reintroduzirem duplicidade.
  - Mitigação: hardening opcional no `create_default_subscription` com `ON CONFLICT DO NOTHING`.

Escopo propositalmente fora (para não atrasar a correção do signup)
- Ajustar `device_quantity` com base no campo “Quantos computadores…” do formulário (hoje o frontend manda `device_count` como string “1-3”, etc.). Podemos fazer isso após o signup voltar a funcionar, com uma regra clara de mapeamento (ex.: “1-3” → 3) e validação.

Resultado esperado
- Signup deixa de retornar 500.
- O tenant é criado normalmente.
- A assinatura fica em `trialing` com `trial_end` e `current_period_end` em 14 dias, sem violar o UNIQUE `(tenant_id)`.

