/**
 * Setup de Usuários de Teste para E2E (Sprint 1 — run-rls-tests authz)
 *
 * FLUXO REAL DE USUÁRIO (sem service_role, sem bypass):
 *   1. Carrega .env.test / .env.test.local (override: false).
 *   2. Para cada usuário de teste, chama `supabase.auth.signUp` com a Anon Key
 *      — exatamente como um signup público.
 *   3. Trata "User already registered" / 422 como sucesso (idempotente).
 *
 * Roles, tenants e confirmação de e-mail são aplicados pela migration:
 *   supabase/migrations/*_sprint1_seed_test_roles.sql
 *
 * Uso local ou em CI:
 *   npx tsx tests/setup-test-users.ts
 *
 * Requer apenas variáveis PUBLISHABLE:
 *   - VITE_SUPABASE_URL
 *   - VITE_SUPABASE_PUBLISHABLE_KEY  (anon)
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.test', '.env.test.local']) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) loadEnv({ path: p, override: false });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[ERROR] Variáveis faltando: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

// Cliente público — mesma chave que o frontend usa.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface TestUser {
  email: string;
  password: string;
  fullName: string;
  role: string;
}

const TEST_USERS: TestUser[] = [
  {
    email: process.env.TEST_SUPER_ADMIN_EMAIL || 'super@cybershield.test',
    password: process.env.TEST_SUPER_ADMIN_PASSWORD || 'SupZ9!kV2pQrW8tN',
    fullName: 'Super Admin Test',
    role: 'super_admin',
  },
  {
    email: process.env.TEST_VIEWER_EMAIL || 'viewer@cybershield.test',
    password: process.env.TEST_VIEWER_PASSWORD || 'VwR7#mB4zX1cT6Y',
    fullName: 'Viewer Test',
    role: 'viewer',
  },
];

type SignUpOutcome = 'created' | 'already_registered' | 'error';

async function signUpIdempotent(u: TestUser): Promise<SignUpOutcome> {
  const { data, error } = await supabase.auth.signUp({
    email: u.email,
    password: u.password,
    options: { data: { full_name: u.fullName } },
  });

  if (!error) {
    // Supabase responde 200 mesmo quando o usuário já existe (anti-enumeração).
    // Distinguimos pelo `identities`: vazio = e-mail já registrado.
    const identities = data.user?.identities;
    if (data.user && identities && identities.length === 0) {
      console.log(`[OK] já registrado: ${u.email}`);
      return 'already_registered';
    }
    console.log(`[OK] criado:        ${u.email}`);
    return 'created';
  }

  const msg = (error.message || '').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already exists') || error.status === 422) {
    console.log(`[OK] já registrado: ${u.email}`);
    return 'already_registered';
  }

  console.error(`[ERROR] signUp ${u.email}: ${error.message}`);
  return 'error';
}

async function main() {
  console.log('=====================================================');
  console.log(' Setup E2E — signUp idempotente via Anon Key');
  console.log('=====================================================\n');

  let errors = 0;
  for (const u of TEST_USERS) {
    const outcome = await signUpIdempotent(u);
    if (outcome === 'error') errors++;
  }

  console.log('\n-----------------------------------------------------');
  console.log(' Próximo passo: aplicar migration de roles/tenants e');
  console.log(' confirmação de e-mail para os usuários de teste:');
  console.log('   supabase/migrations/*_sprint1_seed_test_roles.sql');
  console.log('\n Depois execute:');
  console.log('   npx playwright test e2e/sprint1-run-rls-tests-authz.spec.ts');
  console.log('-----------------------------------------------------');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
