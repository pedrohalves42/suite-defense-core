/**
 * Setup de Usuarios de Teste
 * 
 * Este script cria os usuarios de teste necessarios para os testes E2E.
 * Deve ser executado ANTES de rodar o seed SQL.
 * 
 * Uso:
 *   npx tsx tests/setup-test-users.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[ERROR]  Variaveis de ambiente faltando:');
  console.error('   - VITE_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_USERS = [
  {
    email: 'admin@test.com',
    password: 'TestPassword123!',
    fullName: 'Test Admin',
    role: 'admin' as const,
  },
  {
    email: 'viewer@test.com',
    password: 'TestPassword123!',
    fullName: 'Test Viewer',
    role: 'viewer' as const,
  },
];

async function createTestUser(email: string, password: string, fullName: string) {
  console.log(`\n? Criando usuario: ${email}`);

  // Verificar se ja existe
  const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
  const userExists = existingUser?.users.find((u) => u.email === email);

  if (userExists) {
    console.log(`[OK]  Usuario ja existe: ${email} (${userExists.id})`);
    return userExists.id;
  }

  // Criar novo usuario
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirmar email
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error) {
    console.error(`[ERROR]  Erro ao criar ${email}:`, error.message);
    throw error;
  }

  console.log(`[OK]  Usuario criado: ${email} (${data.user.id})`);
  return data.user.id;
}

async function main() {
  console.log('? Iniciando setup de usuarios de teste...\n');

  try {
    // Criar usuarios
    const userIds: string[] = [];
    for (const user of TEST_USERS) {
      const userId = await createTestUser(user.email, user.password, user.fullName);
      userIds.push(userId);
    }

    console.log('\n[OK]  Todos os usuarios criados com sucesso!');
    console.log('\n? Proximos passos:');
    console.log('   1. Execute o seed SQL:');
    console.log('      psql $DATABASE_URL -f supabase/seed-test-users.sql');
    console.log('   2. Ou use a UI do Supabase para executar o SQL');
    console.log('   3. Execute os testes E2E:');
    console.log('      npx playwright test e2e/update-user-role.spec.ts');

  } catch (error) {
    console.error('\n[ERROR]  Erro no setup:', error);
    process.exit(1);
  }
}

main();
