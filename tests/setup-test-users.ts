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
    email: 'super@cybershield.test',
    password: 'SuperSecure123!',
    fullName: 'Super Admin Test',
    role: 'super_admin' as const,
    tenant: 'test-tenant-a',
  },
  {
    email: 'admin@test.com',
    password: 'Test1234!',
    fullName: 'Admin Tenant A',
    role: 'admin' as const,
    tenant: 'test-tenant-a',
  },
  {
    email: 'admin-b@test.com',
    password: 'Test1234!',
    fullName: 'Admin Tenant B',
    role: 'admin' as const,
    tenant: 'test-tenant-b',
  },
  {
    email: 'operator@test.com',
    password: 'Test1234!',
    fullName: 'Operator Test',
    role: 'operator' as const,
    tenant: 'test-tenant-a',
  },
  {
    email: 'viewer@test.com',
    password: 'Test1234!',
    fullName: 'Viewer Test',
    role: 'viewer' as const,
    tenant: 'test-tenant-a',
  },
  {
    email: 'member@test.com',
    password: 'Test1234!',
    fullName: 'Member Test',
    role: 'member' as const,
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

async function main() {
  console.log('=====================================================');
  console.log(' Setup de Usuarios de Teste para E2E');
  console.log('=====================================================\n');

  const createdUsers: CreatedUser[] = [];
  let hasErrors = false;

  // Criar todos os usuarios
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

  // Resumo
  console.log('\n=====================================================');
  console.log(' RESUMO');
  console.log('=====================================================');
  console.log(`\n[OK] Usuarios criados/existentes: ${createdUsers.length}/${TEST_USERS.length}`);
  
  if (hasErrors) {
    console.log('[WARN] Alguns usuarios falharam - verifique os erros acima');
  }

  // Tabela de usuarios criados
  console.log('\n| Email | Role | Tenant |');
  console.log('|-------|------|--------|');
  for (const user of createdUsers) {
    console.log(`| ${user.email} | ${user.role} | ${user.tenant} |`);
  }

  // Proximos passos
  console.log('\n=====================================================');
  console.log(' PROXIMOS PASSOS');
  console.log('=====================================================');
  console.log('\n1. Execute o seed SQL para criar tenants e roles:');
  console.log('   - Acesse o SQL Editor do Supabase');
  console.log('   - Cole o conteudo de supabase/seed-test-users.sql');
  console.log('   - Execute a query');
  console.log('\n2. Verifique se o .env.test esta configurado');
  console.log('\n3. Execute os testes E2E:');
  console.log('   npx playwright test');
  console.log('\n=====================================================');

  process.exit(hasErrors ? 1 : 0);
}

main().catch((error) => {
  console.error('\n[ERROR] Erro fatal:', error);
  process.exit(1);
});
