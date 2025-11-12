# 🧪 Setup de Usuários de Teste

Este guia explica como configurar os usuários de teste necessários para executar os testes E2E.

## 📋 Pré-requisitos

- Node.js 18+
- Acesso ao projeto Supabase
- Variáveis de ambiente configuradas:
  - `VITE_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## 🚀 Setup Rápido

### Opção 1: Script Automatizado (Recomendado)

```bash
# 1. Instalar dependências (se necessário)
npm install tsx @supabase/supabase-js

# 2. Criar usuários via API (usa SERVICE_ROLE_KEY)
npx tsx tests/setup-test-users.ts

# 3. Popular tenant e roles (via SQL)
# Execute o conteúdo de supabase/seed-test-users.sql no SQL Editor do Supabase
```

### Opção 2: Setup Manual

1. **Criar usuários no Supabase Dashboard:**
   - Vá para Authentication > Users > Add User
   - Criar `admin@test.com` com senha `TestPassword123!`
   - Criar `viewer@test.com` com senha `TestPassword123!`
   - ✅ Marcar "Auto Confirm User"

2. **Executar seed SQL:**
   - Vá para SQL Editor no Supabase Dashboard
   - Colar o conteúdo de `supabase/seed-test-users.sql`
   - Executar query

## 🧪 Usuários de Teste

| Email | Senha | Role | Tenant |
|-------|-------|------|--------|
| `admin@test.com` | `TestPassword123!` | admin | Test Tenant |
| `viewer@test.com` | `TestPassword123!` | viewer | Test Tenant |

## ✅ Validação

Execute a seguinte query SQL para verificar:

```sql
SELECT 
  u.email,
  p.full_name,
  ur.role,
  t.name as tenant_name
FROM auth.users u
JOIN public.profiles p ON p.user_id = u.id
JOIN public.user_roles ur ON ur.user_id = u.id
JOIN public.tenants t ON t.id = ur.tenant_id
WHERE u.email IN ('admin@test.com', 'viewer@test.com')
ORDER BY u.email;
```

Resultado esperado:

```
email              | full_name   | role   | tenant_name
-------------------|-------------|--------|-------------
admin@test.com     | Test Admin  | admin  | Test Tenant
viewer@test.com    | Test Viewer | viewer | Test Tenant
```

## 🧹 Limpeza

Para remover os usuários de teste:

```sql
-- Limpar roles e profiles
DELETE FROM public.user_roles WHERE tenant_id IN (
  SELECT id FROM public.tenants WHERE slug = 'test-tenant'
);
DELETE FROM public.profiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('admin@test.com', 'viewer@test.com')
);
DELETE FROM public.tenants WHERE slug = 'test-tenant';

-- Deletar usuários (via Dashboard ou Admin API)
-- Authentication > Users > Delete
```

## 🔒 Segurança

⚠️ **IMPORTANTE:**
- Estes usuários são **apenas para testes locais**
- **NUNCA** use estes usuários em produção
- **NUNCA** commite `SUPABASE_SERVICE_ROLE_KEY` no git
- Use `.env.local` para credenciais sensíveis

## 📝 Troubleshooting

### Erro: "Variáveis de ambiente faltando"

```bash
# Verifique se as variáveis estão definidas
echo $VITE_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Ou crie um .env.local com:
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

### Erro: "User already exists"

Isso é normal se os usuários já foram criados. O script detecta e pula a criação.

### Erro no seed SQL: "violates foreign key constraint"

Isso significa que os usuários não existem no `auth.users`. Execute primeiro o script TypeScript:

```bash
npx tsx tests/setup-test-users.ts
```

## 🧪 Executar Testes E2E

Após o setup:

```bash
# Todos os testes de role
npx playwright test e2e/update-user-role.spec.ts

# Teste específico
npx playwright test e2e/update-user-role.spec.ts -g "admin pode atualizar role"

# Com UI
npx playwright test e2e/update-user-role.spec.ts --ui
```

## 📚 Arquivos Relacionados

- `supabase/seed-test-users.sql` - Seed SQL para tenant e roles
- `tests/setup-test-users.ts` - Script de criação de usuários
- `e2e/update-user-role.spec.ts` - Testes E2E de roles
- `.env.test` - Template de variáveis de ambiente para testes
