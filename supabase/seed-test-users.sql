-- =====================================================
-- SEED: Usuarios de Teste para E2E
-- =====================================================
-- IMPORTANTE: Este script assume que os usuarios ja existem no auth.users
-- Use o script tests/setup-test-users.ts para criar os usuarios primeiro
-- =====================================================

-- =====================================================
-- 1. LIMPEZA DE DADOS ANTERIORES
-- =====================================================

-- Limpar user_roles de tenants de teste
DELETE FROM public.user_roles WHERE tenant_id IN (
  SELECT id FROM public.tenants WHERE slug IN ('test-tenant-a', 'test-tenant-b', 'test-tenant')
);

-- Limpar profiles dos usuarios de teste
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

-- Limpar tenants de teste antigos
DELETE FROM public.tenants WHERE slug IN ('test-tenant-a', 'test-tenant-b', 'test-tenant');

-- =====================================================
-- 2. CRIAR TENANTS DE TESTE
-- =====================================================

-- Tenant A (principal)
INSERT INTO public.tenants (id, name, slug, owner_user_id)
SELECT 
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'Test Tenant A',
  'test-tenant-a',
  id
FROM auth.users WHERE email = 'admin@test.com'
LIMIT 1
ON CONFLICT (slug) DO NOTHING;

-- Tenant B (para testes cross-tenant)
INSERT INTO public.tenants (id, name, slug, owner_user_id)
SELECT 
  'b0000000-0000-0000-0000-000000000002'::uuid,
  'Test Tenant B',
  'test-tenant-b',
  id
FROM auth.users WHERE email = 'admin-b@test.com'
LIMIT 1
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- 3. CRIAR PROFILES PARA TODOS OS USUARIOS
-- =====================================================

INSERT INTO public.profiles (user_id, full_name)
SELECT 
  u.id,
  CASE 
    WHEN u.email = 'super@cybershield.test' THEN 'Super Admin Test'
    WHEN u.email = 'admin@test.com' THEN 'Admin Tenant A'
    WHEN u.email = 'admin-b@test.com' THEN 'Admin Tenant B'
    WHEN u.email = 'operator@test.com' THEN 'Operator Test'
    WHEN u.email = 'viewer@test.com' THEN 'Viewer Test'
    WHEN u.email = 'member@test.com' THEN 'Member Test'
  END as full_name
FROM auth.users u
WHERE u.email IN (
  'super@cybershield.test',
  'admin@test.com',
  'admin-b@test.com',
  'operator@test.com',
  'viewer@test.com',
  'member@test.com'
)
ON CONFLICT (user_id) DO UPDATE SET
  full_name = EXCLUDED.full_name;

-- =====================================================
-- 4. CRIAR USER_ROLES
-- =====================================================

-- Super Admin (tem acesso a todos os tenants como super_admin)
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT 
  u.id,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'super_admin'::app_role
FROM auth.users u
WHERE u.email = 'super@cybershield.test'
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

-- Admin Tenant A
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT 
  u.id,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'admin'::app_role
FROM auth.users u
WHERE u.email = 'admin@test.com'
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

-- Admin Tenant B
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT 
  u.id,
  'b0000000-0000-0000-0000-000000000002'::uuid,
  'admin'::app_role
FROM auth.users u
WHERE u.email = 'admin-b@test.com'
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

-- Operator Tenant A
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT 
  u.id,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'operator'::app_role
FROM auth.users u
WHERE u.email = 'operator@test.com'
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

-- Viewer Tenant A
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT 
  u.id,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'viewer'::app_role
FROM auth.users u
WHERE u.email = 'viewer@test.com'
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

-- Member Tenant A
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT 
  u.id,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'member'::app_role
FROM auth.users u
WHERE u.email = 'member@test.com'
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

-- =====================================================
-- 5. VERIFICACAO FINAL
-- =====================================================

SELECT 
  u.email,
  p.full_name,
  ur.role,
  t.name as tenant_name,
  t.slug as tenant_slug
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
ORDER BY 
  CASE ur.role
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'operator' THEN 3
    WHEN 'viewer' THEN 4
    WHEN 'member' THEN 5
  END;
