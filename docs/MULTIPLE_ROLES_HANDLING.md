# Multiple Roles Handling Guide

## 🚨 O Problema

Quando um usuário tem **múltiplas roles** (por exemplo, `admin` + `super_admin`), usar `.single()` em queries para a tabela `user_roles` causa erros **PGRST116** e **500 Internal Server Error**.

### Por quê?

```typescript
// ❌ ERRADO - Falha se usuário tem múltiplos roles
const { data } = await supabase
  .from('user_roles')
  .select('tenant_id')
  .eq('user_id', user.id)
  .single(); // 💥 Erro: "Results contain 2 rows, requires 1 row"
```

O método `.single()` **exige exatamente 1 resultado**. Se houver 2+ roles, ele falha.

---

## ✅ A Solução: `getTenantIdForUser()`

Criamos um **helper compartilhado** em `supabase/functions/_shared/tenant.ts` que resolve este problema:

```typescript
import { getTenantIdForUser } from '../_shared/tenant.ts';

// ✅ CORRETO - Funciona com 1 ou múltiplos roles
const tenantId = await getTenantIdForUser(supabase, user.id);

if (!tenantId) {
  return new Response(
    JSON.stringify({ error: 'Tenant not found' }),
    { status: 403, headers: corsHeaders }
  );
}
```

### Como Funciona?

```typescript
export async function getTenantIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)           // 👈 Pega apenas o primeiro
    .maybeSingle();     // 👈 Retorna null se vazio (não falha)

  if (error) {
    console.error('[getTenantIdForUser] Error:', error);
    return null;
  }

  return data?.tenant_id || null;
}
```

**Vantagens:**
- ✅ Funciona com 1 role
- ✅ Funciona com múltiplos roles (pega o primeiro)
- ✅ Não falha se não houver roles (retorna `null`)
- ✅ Centralizado em um único lugar

---

## 🛠️ Funções Disponíveis

### 1. `getTenantIdForUser(supabase, userId)`

Retorna o `tenant_id` do usuário (primeiro encontrado).

**Uso:**
```typescript
const tenantId = await getTenantIdForUser(supabase, user.id);
if (!tenantId) {
  throw new Error('User has no tenant');
}
```

### 2. `verifyUserTenant(supabase, userId, tenantId)`

Verifica se um usuário pertence a um tenant específico.

**Uso:**
```typescript
const isInTenant = await verifyUserTenant(supabase, targetUserId, adminTenantId);
if (!isInTenant) {
  return new Response(
    JSON.stringify({ error: 'User not in tenant' }),
    { status: 403, headers: corsHeaders }
  );
}
```

---

## 📋 Checklist de Migração

Ao atualizar uma edge function ou frontend component:

- [ ] **Edge Functions:**
  - [ ] Importar `getTenantIdForUser` de `_shared/tenant.ts`
  - [ ] Substituir queries diretas com `.single()` por `getTenantIdForUser()`
  - [ ] Testar com usuário que tem múltiplos roles

- [ ] **Frontend (React):**
  - [ ] Usar o hook `useTenant()` ao invés de queries diretas
  - [ ] Adicionar `loading` state do `useTenant`
  - [ ] Usar `tenant?.id` nas queries dependentes
  - [ ] Adicionar `enabled: !!tenant?.id` nas queries

---

## 🔍 Exemplos de Correção

### Edge Function - Antes ❌

```typescript
const { data: userRole } = await supabase
  .from('user_roles')
  .select('tenant_id')
  .eq('user_id', user.id)
  .single(); // 💥 Falha com múltiplos roles

const tenantId = userRole?.tenant_id;
```

### Edge Function - Depois ✅

```typescript
import { getTenantIdForUser } from '../_shared/tenant.ts';

const tenantId = await getTenantIdForUser(supabase, user.id);

if (!tenantId) {
  return new Response(
    JSON.stringify({ error: 'Tenant not found' }),
    { status: 403, headers: corsHeaders }
  );
}
```

---

### React Component - Antes ❌

```typescript
const { data: subscription } = useQuery({
  queryKey: ['subscription'],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    // 💥 Falha com múltiplos roles
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    const { data } = await supabase
      .from('tenant_subscriptions')
      .eq('tenant_id', userRole.tenant_id)
      .single();

    return data;
  },
});
```

### React Component - Depois ✅

```typescript
import { useTenant } from '@/hooks/useTenant';

const { tenant, loading: tenantLoading } = useTenant();

const { data: subscription } = useQuery({
  queryKey: ['subscription', tenant?.id],
  queryFn: async () => {
    if (!tenant?.id) throw new Error('Tenant not found');

    const { data } = await supabase
      .from('tenant_subscriptions')
      .eq('tenant_id', tenant.id)
      .single();

    return data;
  },
  enabled: !!tenant?.id, // ✅ Só executa se tenant existir
});

// ✅ Mostrar loading
if (tenantLoading) {
  return <div>Carregando...</div>;
}
```

---

## 🧪 Testando

### Teste Manual

1. Criar um usuário com múltiplos roles:
```sql
INSERT INTO user_roles (user_id, tenant_id, role) VALUES
  ('user-uuid', 'tenant-uuid', 'admin'),
  ('user-uuid', 'tenant-uuid', 'super_admin');
```

2. Testar edge function ou página:
```bash
# Edge function
curl -X POST https://your-project.supabase.co/functions/v1/your-function \
  -H "Authorization: Bearer YOUR_TOKEN"

# Frontend
# Fazer login e navegar para a página
```

3. Verificar logs:
```bash
# Deve ver: "[getTenantIdForUser] Found tenant: tenant-uuid"
# Não deve ver: "PGRST116" ou "500 Internal Server Error"
```

---

## 🚀 Edge Functions Corrigidas

✅ Já corrigidas:
- `get-agent-dashboard-data`
- `check-subscription`
- `create-checkout`
- `customer-portal`
- `track-installation-event`
- `update-member-role`
- `update-user-status`
- `validate-agent-health`

⚠️ Pendentes de revisão:
- `send-invite`
- `generate-enrollment-key`
- `auto-generate-enrollment`
- `serve-installer`

---

## 📖 Referências

- **Helper Source:** `supabase/functions/_shared/tenant.ts`
- **React Hook:** `src/hooks/useTenant.tsx`
- **RLS Best Practices:** `docs/RLS_BEST_PRACTICES.md`

---

## 💡 Dicas

1. **Sempre use o helper em edge functions** ao buscar `tenant_id`
2. **Sempre use `useTenant()` hook em React** ao invés de queries manuais
3. **Teste com múltiplos roles** antes de fazer deploy
4. **Verifique logs do Postgres** para erros PGRST116
5. **Documente qualquer caso especial** que não se aplica a este padrão

---

**Última atualização:** 2025-01-17  
**Relacionado:** Fix RLS infinite recursion, Tenant management corrections
