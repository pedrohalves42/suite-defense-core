# 🧪 Setup Completo de Usuários de Teste para E2E

Este guia explica como configurar todos os usuários de teste necessários para executar os testes E2E.

## 📋 Pré-requisitos

- Node.js 18+
- Acesso ao projeto Supabase
- Variáveis de ambiente configuradas:
  - `VITE_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (para criar usuários)

## 🚀 Setup Rápido

### 1. Instalar dependências
```bash
npm install
```

### 2. Criar usuários via script
```bash
# Configurar SERVICE_ROLE_KEY temporariamente
export SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key-aqui"

# Executar script de criação
npx tsx tests/setup-test-users.ts
```

### 3. Executar seed SQL
- Acesse o SQL Editor do backend (Lovable Cloud)
- Cole o conteúdo de `supabase/seed-test-users.sql`
- Execute a query

### 4. Verificar configuração
```bash
# Rodar testes básicos
npx playwright test e2e/admin-access.spec.ts --headed
```

## 🧪 Usuários de Teste

| Email | Senha | Role | Tenant |
|-------|-------|------|--------|
| `super@cybershield.test` | `SuperSecure123!` | super_admin | test-tenant-a |
| `admin@test.com` | `Test1234!` | admin | test-tenant-a |
| `admin-b@test.com` | `Test1234!` | admin | test-tenant-b |
| `operator@test.com` | `Test1234!` | operator | test-tenant-a |
| `viewer@test.com` | `Test1234!` | viewer | test-tenant-a |
| `member@test.com` | `Test1234!` | member | test-tenant-a |

## 🏢 Tenants de Teste

| ID | Nome | Slug |
|----|------|------|
| `a0000000-0000-0000-0000-000000000001` | Test Tenant A | test-tenant-a |
| `b0000000-0000-0000-0000-000000000002` | Test Tenant B | test-tenant-b |

## ✅ Validação

Execute esta query SQL para verificar a configuração:

```sql
SELECT 
  u.email,
  p.full_name,
  ur.role,
  t.name as tenant_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
LEFT JOIN public.tenants t ON t.id = ur.tenant_id
WHERE u.email IN (
  'super@cybershield.test',
  'admin@test.com',
  'admin-b@test.com',
  'operator@test.com',
  'viewer@test.com',
  'member@test.com'
)
ORDER BY ur.role;
```

Resultado esperado:

```
email                    | full_name        | role        | tenant_name
-------------------------|------------------|-------------|-------------
super@cybershield.test   | Super Admin Test | super_admin | Test Tenant A
admin@test.com           | Admin Tenant A   | admin       | Test Tenant A
admin-b@test.com         | Admin Tenant B   | admin       | Test Tenant B
operator@test.com        | Operator Test    | operator    | Test Tenant A
viewer@test.com          | Viewer Test      | viewer      | Test Tenant A
member@test.com          | Member Test      | member      | Test Tenant A
```

## 🧪 Executar Testes E2E

```bash
# Todos os testes
npx playwright test

# Testes específicos
npx playwright test e2e/admin-access.spec.ts
npx playwright test e2e/cross-tenant-isolation.spec.ts
npx playwright test e2e/privilege-escalation.spec.ts

# Com interface visual
npx playwright test --ui

# Modo headed (ver navegador)
npx playwright test --headed

# Relatório HTML
npx playwright show-report
```

## 🧹 Limpeza

Para remover todos os dados de teste:

```sql
-- Limpar roles e profiles
DELETE FROM public.user_roles WHERE tenant_id IN (
  SELECT id FROM public.tenants WHERE slug IN ('test-tenant-a', 'test-tenant-b')
);

DELETE FROM public.profiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN (
    'super@cybershield.test',
    'admin@test.com',
    'admin-b@test.com',
    'operator@test.com',
    'viewer@test.com',
    'member@test.com'
  )
);

DELETE FROM public.tenants WHERE slug IN ('test-tenant-a', 'test-tenant-b');

-- Deletar usuários via Dashboard ou Admin API
-- Authentication > Users > Delete
```

## 🔒 Segurança

⚠️ **IMPORTANTE:**
- Estes usuários são **apenas para testes locais/staging**
- **NUNCA** use estas credenciais em produção
- **NUNCA** commite `SUPABASE_SERVICE_ROLE_KEY` no git
- Use `.env.local` ou variáveis de ambiente para credenciais sensíveis

## 📝 Troubleshooting

### Erro: "Variáveis de ambiente faltando"
```bash
# Verifique se as variáveis estão definidas
echo $VITE_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

### Erro: "User already exists"
Normal se os usuários já foram criados. O script detecta e pula a criação.

### Erro no seed SQL: "violates foreign key constraint"
Significa que os usuários não existem no `auth.users`. Execute primeiro o script TypeScript:
```bash
npx tsx tests/setup-test-users.ts
```

### Erro: "member is not a valid app_role"
A migration para adicionar `member` ao enum precisa ser executada. Verifique se a migration rodou.

### Testes falhando com "Unauthorized"
1. Verifique se `.env.test` está configurado corretamente
2. Confirme que o seed SQL foi executado
3. Verifique se os usuários têm roles atribuídos

## 📚 Arquivos Relacionados

| Arquivo | Descrição |
|---------|-----------|
| `tests/setup-test-users.ts` | Script para criar usuários no auth.users |
| `supabase/seed-test-users.sql` | SQL para criar tenants, profiles e roles |
| `.env.test` | Variáveis de ambiente para testes |
| `e2e/fixtures/security-test-users.ts` | Fixtures usados nos testes E2E |
| `playwright.config.ts` | Configuração do Playwright |

## 🎯 Casos de Teste Cobertos

Com esta configuração, você pode testar:

- ✅ **Autenticação**: Login/logout de diferentes roles
- ✅ **Autorização**: Acesso baseado em roles (admin, operator, viewer, member)
- ✅ **Isolamento de Tenant**: Dados de tenant-a não visíveis para tenant-b
- ✅ **Privilege Escalation**: Tentativas de elevação de privilégio bloqueadas
- ✅ **Super Admin**: Acesso total ao sistema
- ✅ **Cross-Tenant**: Operações entre tenants diferentes
