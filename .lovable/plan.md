
Contexto (o que está acontecendo de verdade)
- O erro 500 no signup NÃO é mais “duplicidade de subscription”. O log atual do /signup mostra claramente:
  - `ERROR: column "owner_id" of relation "tenants" does not exist (SQLSTATE 42703)`
- Além disso, a versão atual da função `public.handle_new_user()` no ambiente live está quebrada em múltiplos pontos (mesmo que corrigíssemos só o owner_id, ainda daria 500):
  1) Insere em `tenants (name, owner_id)` mas a coluna correta é `owner_user_id` e `slug` é NOT NULL (sem default), então a inserção falharia também por slug.
  2) Insere `user_roles.role = 'owner'`, mas o enum `app_role` não tem `owner` (tem `admin`, `operator`, `viewer`, `super_admin`, `member`, `analyst`), então isso também geraria erro.
  3) Faz INSERT/UPDATE em `tenant_subscriptions` usando `current_period_start`, mas essa coluna NÃO existe (o schema tem `current_period_end`).
  4) Chama `ensure_tenant_features(new_tenant_id)` mas a função existente exige assinatura `ensure_tenant_features(uuid, text, integer)`.

Causa raiz
- A migration mais recente sobrescreveu a função `handle_new_user()` com um “modelo” incompatível com o schema real do seu banco (nomes de colunas/enum/funções divergentes). Resultado: qualquer signup estoura 500.

Objetivo
- Corrigir definitivamente o signup (POST /auth/v1/signup) no ambiente publicado, tornando o trigger `handle_new_user()` compatível com o schema real e idempotente com `create_default_subscription()`.

Estratégia de correção (definitiva, sem “tentativas”)
1) Criar uma NOVA migration que:
   - Reescreve `public.handle_new_user()` usando o schema correto:
     - `tenants(name, slug, owner_user_id)`
     - `user_roles(role = 'admin', tenant_id)`
     - `tenant_subscriptions` sem `current_period_start`, usando `trial_end` e `current_period_end`
     - `ensure_tenant_features(new_tenant_id, 'free', device_qty)`
   - Mantém o comportamento já existente e seguro do fluxo antigo:
     - Cria/atualiza `profiles` de forma idempotente (UPSERT por `user_id`)
     - Respeita “convite pendente”: se o usuário tem invite, não cria tenant próprio
     - Respeita “provisionado por admin”: não cria tenant/role automaticamente
   - Torna o bloco de subscription idempotente com UPSERT:
     - Se o trigger `create_tenant_subscription` já criou a subscription, o UPSERT apenas atualiza para `trialing` com trial de 14 dias.

2) “Fail fast” na migration para evitar regressões futuras:
   - Adicionar um bloco de pré-checagem (DO $$) que valida a existência de colunas/enum/funções usadas pelo trigger.
   - Se algo estiver diferente do esperado, a migration falha na hora (em vez de deixar quebrar signup em produção).

3) Aplicação e propagação:
   - Aplicar a migration no ambiente de teste.
   - Fazer teste end-to-end criando uma conta nova (email nunca usado) no Preview.
   - Publicar para levar a mudança ao ambiente publicado (cybshield.com.br).
   - Repetir o teste end-to-end no ambiente publicado.

Detalhe técnico (o que exatamente será mudado)
A) Migration: Pré-check (impede “quebrar sem perceber”)
- Verificar:
  - `public.tenants` tem colunas `slug` e `owner_user_id`
  - `public.tenant_subscriptions` tem `trial_end` e `current_period_end` e NÃO depende de `current_period_start`
  - `public.ensure_tenant_features(uuid, text, integer)` existe
  - Enum `public.app_role` contém `admin`
  - Existe plano `subscription_plans.name = 'free'`

B) Migration: handle_new_user (versão correta e idempotente)
- Pseudofluxo do trigger:
  1) UPSERT em profiles:
     - `INSERT INTO profiles(user_id, full_name, username, updated_at) ... ON CONFLICT (user_id) DO UPDATE ...`
  2) Se `admin_provisioned` → return
  3) Se `has_pending_invite` → return
  4) Criar tenant com slug único:
     - `tenant_slug := lower(replace(COALESCE(full_name, email), ' ', '-')) || '-' || substring(NEW.id::text from 1 for 8);`
     - `INSERT INTO tenants(name, slug, owner_user_id) VALUES (...) RETURNING id`
  5) Criar role no tenant:
     - `INSERT INTO user_roles(user_id, role, tenant_id) VALUES (NEW.id, 'admin', new_tenant_id);`
  6) Definir device_qty a partir do metadata `device_count` (opcional, mas útil e seguro):
     - mapear “1-3” → 3, “4-10” → 10, “11-30” → 30, “31-100” → 100, “100+” → 100
     - se nulo/desconhecido → 1
  7) UPSERT em tenant_subscriptions (sem colunas inexistentes):
     - `INSERT INTO tenant_subscriptions(tenant_id, plan_id, status, trial_end, current_period_end, device_quantity) ...`
     - `ON CONFLICT (tenant_id) DO UPDATE SET status='trialing', trial_end=..., current_period_end=..., device_quantity=..., updated_at=now()`
  8) `PERFORM ensure_tenant_features(new_tenant_id, 'free', device_qty);`

C) create_default_subscription (manter hardened)
- Manter `ON CONFLICT (tenant_id) DO NOTHING`
- Ajustar (se necessário) para inserir apenas (tenant_id, plan_id) usando defaults (status/device_quantity) — reduz superfície de erro.

Critérios de aceite (verificação objetiva)
1) End-to-end:
   - Acessar /signup
   - Criar usuário com email nunca usado
   - O POST /signup deve retornar 200 (sem 500)
   - UI deve redirecionar para dashboard/onboarding

2) Banco:
   - Confirmar que tenant foi criado:
     - `select id, slug, owner_user_id from tenants order by created_at desc limit 1;`
   - Confirmar role:
     - `select user_id, tenant_id, role from user_roles order by created_at desc limit 5;`
   - Confirmar subscription única e em trial:
     - `select tenant_id, status, trial_end, current_period_end, device_quantity from tenant_subscriptions order by created_at desc limit 5;`
   - Garantir zero duplicidades:
     - `select tenant_id, count(*) from tenant_subscriptions group by tenant_id having count(*) > 1;` → nenhuma linha

3) Observabilidade:
   - Novos logs de /signup não devem conter:
     - `owner_id does not exist`
     - `invalid input value for enum app_role`
     - `column current_period_start does not exist`
     - `function ensure_tenant_features(uuid) does not exist`

Riscos e mitigação
- Risco: plano “free” inexistente → mitigação: migration valida e falha explicitamente.
- Risco: regressão futura por schema drift → mitigação: pré-check na migration + trigger só usa colunas/funções validadas.
- Risco: username duplicado → mitigação: manter username opcional (NULL), não forçar prefixo do email.

O que eu farei quando você aprovar este plano
- Criar a migration com a correção completa do `handle_new_user` + pré-check
- Aplicar no ambiente de teste
- Validar com um signup no Preview
- Publicar para corrigir o ambiente publicado
