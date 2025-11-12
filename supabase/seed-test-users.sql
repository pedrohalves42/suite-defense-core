-- =====================================================
-- SEED: Usuários de Teste para E2E
-- =====================================================
-- IMPORTANTE: Este script assume que os usuários já existem no auth.users
-- Use o script tests/setup-test-users.ts para criar os usuários primeiro
-- =====================================================

-- Limpar dados de teste anteriores
DELETE FROM public.user_roles WHERE tenant_id IN (
  SELECT id FROM public.tenants WHERE slug = 'test-tenant'
);
DELETE FROM public.profiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN ('admin@test.com', 'viewer@test.com')
);
DELETE FROM public.tenants WHERE slug = 'test-tenant';

-- Criar tenant de teste
INSERT INTO public.tenants (id, name, slug, owner_user_id)
VALUES (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'Test Tenant',
  'test-tenant',
  (SELECT id FROM auth.users WHERE email = 'admin@test.com' LIMIT 1)
)
ON CONFLICT (slug) DO NOTHING;

-- Criar profiles para os usuários de teste
INSERT INTO public.profiles (user_id, full_name)
SELECT 
  u.id,
  CASE 
    WHEN u.email = 'admin@test.com' THEN 'Test Admin'
    WHEN u.email = 'viewer@test.com' THEN 'Test Viewer'
  END as full_name
FROM auth.users u
WHERE u.email IN ('admin@test.com', 'viewer@test.com')
ON CONFLICT (user_id) DO UPDATE SET
  full_name = EXCLUDED.full_name;

-- Criar user_roles
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT 
  u.id,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  CASE 
    WHEN u.email = 'admin@test.com' THEN 'admin'::app_role
    WHEN u.email = 'viewer@test.com' THEN 'viewer'::app_role
  END as role
FROM auth.users u
WHERE u.email IN ('admin@test.com', 'viewer@test.com')
ON CONFLICT (user_id, tenant_id) DO UPDATE SET
  role = EXCLUDED.role;

-- Verificação
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
