
# Plano de Correção: Criação de Contas + Licença Genial Cred

## Problema 1: Novos usuários não conseguem criar conta

### Diagnóstico

A função `handle_new_user()` (trigger executado após signup) contém um **bug crítico**:

```sql
-- CÓDIGO ATUAL (linha 73-78):
UPDATE public.tenant_subscriptions
SET 
  trial_end = now() + interval '30 days',
  status = 'trialing'
WHERE tenant_id = new_tenant_id;
```

**Problema**: O `UPDATE` nunca funciona porque a `tenant_subscription` **não existe ainda**! A função cria o tenant, cria o user_role, mas esquece de **criar** a subscription antes de atualizá-la.

### Impacto

| Cenário | Resultado |
|---------|-----------|
| Signup normal | Tenant criado, mas SEM subscription |
| Trial de 14 dias | Nunca ativado |
| Acesso ao dashboard | Usuário bloqueado ou sem features |

### Solução

Corrigir `handle_new_user()` para **INSERT** a subscription antes de configurar features:

```sql
-- APÓS criar tenant e role:

-- 1. INSERIR subscription com trial de 14 dias (plano free)
INSERT INTO public.tenant_subscriptions (
  tenant_id, 
  plan_id, 
  status, 
  trial_end, 
  current_period_end
)
SELECT 
  new_tenant_id,
  id,
  'trialing',
  now() + interval '14 days',
  now() + interval '14 days'
FROM public.subscription_plans 
WHERE name = 'free'
LIMIT 1;

-- 2. Configurar features do plano free
PERFORM public.ensure_tenant_features(new_tenant_id, 'free', 1);
```

---

## Problema 2: Genial Cred - Estender licença Pro até 2026

### Status Atual

| Campo | Valor Atual |
|-------|-------------|
| Tenant ID | `2584d2cd-8b99-4ca7-a8e2-b61256e82b3e` |
| Plano | Pro (`ae808b7a-9da8-4462-9c4f-92c7dacd6282`) |
| Status | active |
| Expira em | `2026-01-31` |
| Dispositivos | 200 |

### Alteração Necessária

Estender `current_period_end` e `trial_end` para **31/12/2026**:

```sql
UPDATE tenant_subscriptions 
SET 
  current_period_end = '2026-12-31 23:59:59+00'::timestamptz,
  trial_end = '2026-12-31 23:59:59+00'::timestamptz,
  updated_at = now()
WHERE tenant_id = '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e';
```

---

## Resumo das Alterações

### 1. Migration SQL

Corrige o trigger `handle_new_user` para:
- **INSERIR** a subscription com plano `free` e trial de 14 dias
- Garantir que `ensure_tenant_features` seja chamado após a subscription existir

### 2. Migration SQL Genial Cred

Atualiza a subscription do Genial Cred para expirar em 31/12/2026.

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Novo signup | Sem subscription | 14 dias trial ativo |
| Dashboard novo usuário | Bloqueado/erro | Funcional com features free |
| Genial Cred expira | 31/01/2026 | 31/12/2026 |

---

## Arquivos Modificados

1. **Migration**: Corrigir `handle_new_user()` com INSERT antes de UPDATE
2. **Migration**: Estender licença Genial Cred até 31/12/2026
