-- =====================================================
-- SEED: Usuarios de Teste para E2E
-- =====================================================
-- IMPORTANTE: Este script assume que os usuarios ja existem no auth.users
-- Use o script tests/setup-test-users.ts para criar os usuarios primeiro
-- =====================================================

-- =====================================================
-- 0. PRE-REQUISITOS: VERIFICAR AUTH.USERS
-- =====================================================
DO $$
DECLARE
  missing_users text[];
BEGIN
  SELECT array_agg(email) INTO missing_users
  FROM (
    VALUES
      ('admin@test.com'),
      ('member@test.com'),
      ('super@cybershield.test'),
      ('admin-b@test.com'),
      ('operator@test.com'),
      ('viewer@test.com')
  ) AS required(email)
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.email = required.email
  );

  IF array_length(missing_users, 1) > 0 THEN
    RAISE WARNING 
      'SEED PARCIAL: Usuarios auth ausentes: %. Execute setup-test-users.ts primeiro.',
      missing_users;
  END IF;
END $$;

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
-- 5. CRIAR TENANT_FEATURES PARA TESTES
-- =====================================================

-- Features essenciais para Tenant A (simula plano Starter)
INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit)
VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'max_users', true, 10),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'agents', true, 50),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'jobs', true, 500),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'virus_scans', true, 1000),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'advanced_scans_daily', true, 2),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'quarantine', true, 100),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'audit_logs', true, NULL),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'email_alerts', true, NULL)
ON CONFLICT (tenant_id, feature_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  quota_limit = EXCLUDED.quota_limit;

-- Features para Tenant B (plano Free, limites menores)
INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit)
VALUES
  ('b0000000-0000-0000-0000-000000000002'::uuid, 'max_users', true, 3),
  ('b0000000-0000-0000-0000-000000000002'::uuid, 'agents', true, 5),
  ('b0000000-0000-0000-0000-000000000002'::uuid, 'jobs', true, 50)
ON CONFLICT (tenant_id, feature_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  quota_limit = EXCLUDED.quota_limit;

-- =====================================================
-- 5.5 GARANTIR SUBSCRIPTION_PLANS EXISTEM
-- =====================================================
INSERT INTO public.subscription_plans (id, name, max_users, max_agents, max_scans_per_month, price_per_device)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'free', 3, 5, 100, 0),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'starter', 10, 50, 1000, 299),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'professional', 50, 200, 5000, 499)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 6. CRIAR TENANT_SUBSCRIPTIONS PARA TESTES
-- =====================================================

-- Subscription para Tenant A (Starter plan - ID fixo)
INSERT INTO public.tenant_subscriptions (id, tenant_id, plan_id, status, device_quantity)
VALUES (
  'a0000000-0000-0000-0000-000000000011'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid, -- starter
  'active',
  30
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  device_quantity = EXCLUDED.device_quantity;

-- Subscription para Tenant B (Free plan - ID fixo)
INSERT INTO public.tenant_subscriptions (id, tenant_id, plan_id, status, device_quantity)
VALUES (
  'b0000000-0000-0000-0000-000000000022'::uuid,
  'b0000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid, -- free
  'active',
  3
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  device_quantity = EXCLUDED.device_quantity;

-- =====================================================
-- 7. CRIAR ENROLLMENT KEY DE TESTE
-- =====================================================

INSERT INTO public.enrollment_keys (id, tenant_id, description, key, max_uses, expires_at)
VALUES (
  'e0000000-0000-0000-0000-000000000001'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'Test Enrollment Key for E2E',
  'TEST-ENROLL-KEY-12345',
  100,
  NOW() + INTERVAL '1 year'
)
ON CONFLICT (id) DO UPDATE SET
  max_uses = EXCLUDED.max_uses,
  expires_at = EXCLUDED.expires_at;

-- =====================================================
-- 8. CRIAR AGENT DE TESTE (para testes de agent management)
-- =====================================================

INSERT INTO public.agents (id, tenant_id, agent_name, hostname, status, agent_version, hmac_secret, last_heartbeat)
VALUES (
  'ag000000-0000-0000-0000-000000000001'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'test-agent-e2e-01',
  'test-computer-01',
  'active',
  '1.0.0',
  'test-hmac-secret-for-e2e-testing-only',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  last_heartbeat = EXCLUDED.last_heartbeat;

-- =====================================================
-- 9. VERIFICACAO FINAL
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

-- Verificar tenant_features
SELECT 
  t.name as tenant_name,
  tf.feature_key,
  tf.quota_limit,
  tf.enabled
FROM public.tenant_features tf
JOIN public.tenants t ON t.id = tf.tenant_id
WHERE t.slug IN ('test-tenant-a', 'test-tenant-b')
ORDER BY t.name, tf.feature_key;
