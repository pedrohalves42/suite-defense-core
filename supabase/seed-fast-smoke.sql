-- ============================================================
-- FAST SMOKE SEED - CYBERSHIELD
-- < 1s execution, CI-safe, FK-compatible
-- ============================================================
-- Este seed cria dados minimos para smoke tests sem depender
-- de setup-test-users.ts. Requer pelo menos 1 usuario em auth.users.
-- ============================================================

-- ============================================================
-- 1. VERIFICAR SE EXISTE PELO MENOS 1 USUARIO
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users LIMIT 1) THEN
    RAISE WARNING 'SMOKE SEED: Nenhum usuario em auth.users. Login tests vao falhar.';
  END IF;
END $$;

-- ============================================================
-- 2. GARANTIR TENANT SMOKE EXISTE (usando primeiro user como owner)
-- ============================================================
INSERT INTO public.tenants (id, name, slug, owner_user_id)
SELECT 
  'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
  'Smoke Tenant',
  'smoke-tenant',
  id
FROM auth.users
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. GARANTIR PROFILE SMOKE EXISTE
-- ============================================================
INSERT INTO public.profiles (user_id, full_name)
SELECT 
  id,
  'Smoke User'
FROM auth.users
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 4. GARANTIR USER_ROLE SMOKE EXISTE
-- ============================================================
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT 
  id,
  'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
  'admin'::app_role
FROM auth.users
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- ============================================================
-- 5. AUDIT LOG MINIMAL (VALIDA RLS + READ)
-- ============================================================
INSERT INTO public.audit_logs (tenant_id, user_id, action, resource_type, success)
SELECT 
  'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
  id,
  'smoke.seed',
  'system',
  true
FROM auth.users
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- SMOKE SEED FINALIZADO
-- ============================================================
