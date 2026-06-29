/**
 * Setup de Usuarios de Teste para E2E (Sprint 1 — run-rls-tests authz)
 *
 * Idempotente. Pode ser executado localmente OU no pipeline de CI:
 *   1. Carrega variáveis de .env.test / .env.test.local (override:false).
 *   2. Cria/garante usuarios em auth.users via Admin API.
 *   3. Garante tenants de teste (test-tenant-a, test-tenant-b).
 *   4. Garante user_roles (super_admin, admin, operator, viewer, member).
 *
 * Uso:
 *   npx tsx tests/setup-test-users.ts
 *
 * Requer:
 *   - VITE_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  (CI secret — nunca commitado)
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Carrega .env.test antes de ler process.env
for (const f of ['.env.test', '.env.test.local']) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) loadEnv({ path: p, override: false });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[ERROR] Variaveis de ambiente faltando:');
  console.error('   - VITE_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY (configure como secret no CI)');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_TENANTS = [
  { id: 'a0000000-0000-0000-0000-000000000001', slug: 'test-tenant-a', name: 'Test Tenant A' },
  { id: 'b0000000-0000-0000-0000-000000000002', slug: 'test-tenant-b', name: 'Test Tenant B' },
];

// Definicao de todos os usuarios de teste
const TEST_USERS = [
  {
    email: process.env.TEST_SUPER_ADMIN_EMAIL || 'super@cybershield.test',
    password: process.env.TEST_SUPER_ADMIN_PASSWORD || 'SupZ9!kV2pQrW8tN',
    fullName: 'Super Admin Test',
    role: 'super_admin' as const,
    tenantId: 'a0000000-0000-0000-0000-000000000001',
    tenant: 'test-tenant-a',
  },
  {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'Test1234!',
    fullName: 'Admin Tenant A',
    role: 'admin' as const,
    tenantId: 'a0000000-0000-0000-0000-000000000001',
    tenant: 'test-tenant-a',
  },
  {
    email: process.env.TEST_ADMIN_B_EMAIL || 'admin-b@test.com',
    password: process.env.TEST_ADMIN_B_PASSWORD || 'Test1234!',
    fullName: 'Admin Tenant B',
    role: 'admin' as const,
    tenantId: 'b0000000-0000-0000-0000-000000000002',
    tenant: 'test-tenant-b',
  },
  {
    email: process.env.TEST_OPERATOR_EMAIL || 'operator@test.com',
    password: process.env.TEST_OPERATOR_PASSWORD || 'Test1234!',
    fullName: 'Operator Test',
    role: 'operator' as const,
    tenantId: 'a0000000-0000-0000-0000-000000000001',
    tenant: 'test-tenant-a',
  },
  {
    email: process.env.TEST_VIEWER_EMAIL || 'viewer@test.com',
    password: process.env.TEST_VIEWER_PASSWORD || 'VwR7#mB4zX1cT6Y',
    fullName: 'Viewer Test',
    role: 'viewer' as const,
    tenantId: 'a0000000-0000-0000-0000-000000000001',
    tenant: 'test-tenant-a',
  },
  {
    email: process.env.TEST_MEMBER_EMAIL || 'member@test.com',
    password: process.env.TEST_MEMBER_PASSWORD || 'Test1234!',
    fullName: 'Member Test',
    role: 'member' as const,
    tenantId: 'a0000000-0000-0000-0000-000000000001',
    tenant: 'test-tenant-a',
  },
];

interface CreatedUser {
  email: string;
  userId: string;
  role: string;
  tenant: string;
}

async function createTestUser(
  email: string, 
  password: string, 
  fullName: string
): Promise<string | null> {
  console.log(`\n→ Criando usuario: ${email}`);

  // Verificar se ja existe
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const userExists = existingUsers?.users.find((u) => u.email === email);

  if (userExists) {
    console.log(`[OK] Usuario ja existe: ${email} (${userExists.id})`);
    return userExists.id;
  }

  // Criar novo usuario
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error) {
    console.error(`[ERROR] Erro ao criar ${email}:`, error.message);
    return null;
  }

  console.log(`[OK] Usuario criado: ${email} (${data.user.id})`);
  return data.user.id;
}

async function ensureTenants(): Promise<void> {
  console.log('\n→ Garantindo tenants de teste...');
  // owner_user_id é NOT NULL; usar o primeiro super_admin/admin criado como owner.
  const { data: adminUser } = await supabaseAdmin.auth.admin.listUsers();
  const ownerA = adminUser?.users.find((u) => u.email === (process.env.TEST_ADMIN_EMAIL || 'admin@test.com'))?.id;
  const ownerB = adminUser?.users.find((u) => u.email === (process.env.TEST_ADMIN_B_EMAIL || 'admin-b@test.com'))?.id;
  const ownerMap: Record<string, string | undefined> = {
    'test-tenant-a': ownerA,
    'test-tenant-b': ownerB,
  };

  for (const t of TEST_TENANTS) {
    const owner = ownerMap[t.slug];
    if (!owner) {
      console.log(`[WARN] tenant ${t.slug}: owner ausente (admin não criado). Pulando.`);
      continue;
    }
    const { error } = await supabaseAdmin
      .from('tenants')
      .upsert({ id: t.id, slug: t.slug, name: t.name, owner_user_id: owner }, { onConflict: 'id' });
    if (error) {
      console.error(`[ERROR] tenant ${t.slug}:`, error.message);
    } else {
      console.log(`[OK] tenant ${t.slug} (${t.id})`);
    }
  }
}

async function ensureRoles(users: CreatedUser[]): Promise<void> {
  console.log('\n→ Garantindo user_roles...');
  for (const u of users) {
    const tenant = TEST_TENANTS.find((t) => t.slug === u.tenant);
    if (!tenant) continue;
    const { error } = await supabaseAdmin
      .from('user_roles')
      .upsert(
        { user_id: u.userId, tenant_id: tenant.id, role: u.role },
        { onConflict: 'user_id,tenant_id,role' },
      );
    if (error) {
      // Trigger prevent_super_admin_self_assignment pode bloquear via service_role? Não, ele checa auth.uid().
      console.error(`[ERROR] role ${u.role} para ${u.email}:`, error.message);
    } else {
      console.log(`[OK] role ${u.role} → ${u.email} @ ${u.tenant}`);
    }
  }
}

async function main() {
  console.log('=====================================================');
  console.log(' Setup de Usuarios de Teste para E2E');
  console.log('=====================================================\n');

  const createdUsers: CreatedUser[] = [];
  let hasErrors = false;

  for (const user of TEST_USERS) {
    const userId = await createTestUser(user.email, user.password, user.fullName);
    if (userId) {
      createdUsers.push({
        email: user.email,
        userId,
        role: user.role,
        tenant: user.tenant,
      });
    } else {
      hasErrors = true;
    }
  }

  await ensureTenants();
  await ensureRoles(createdUsers);

  console.log('\n=====================================================');
  console.log(' RESUMO');
  console.log('=====================================================');
  console.log(`\n[OK] Usuarios processados: ${createdUsers.length}/${TEST_USERS.length}`);
  if (hasErrors) console.log('[WARN] Alguns usuarios falharam - verifique os erros acima');

  console.log('\n| Email | Role | Tenant |');
  console.log('|-------|------|--------|');
  for (const user of createdUsers) {
    console.log(`| ${user.email} | ${user.role} | ${user.tenant} |`);
  }

  console.log('\nProximo passo: npx playwright test e2e/sprint1-run-rls-tests-authz.spec.ts');

  process.exit(hasErrors ? 1 : 0);
}

main().catch((error) => {
  console.error('\n[ERROR] Erro fatal:', error);
  process.exit(1);
});
