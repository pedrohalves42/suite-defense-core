/**
 * Setup Security Test Users
 * 
 * Creates all test users needed for E2E security tests.
 * Includes super_admin, admin, operator, viewer, and member roles.
 * 
 * Usage:
 *   npx tsx tests/setup-security-test-users.ts
 * 
 * Prerequisites:
 *   - VITE_SUPABASE_URL environment variable
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[ERROR] Missing environment variables:');
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

// Test users configuration
const SECURITY_TEST_USERS = [
  {
    email: 'super@cybershield.test',
    password: 'SuperSecure123!',
    fullName: 'Super Admin Test',
    role: 'super_admin' as const,
    tenantSlug: 'test-tenant-a',
  },
  {
    email: 'admin@test.com',
    password: 'Test1234!',
    fullName: 'Admin Tenant A',
    role: 'admin' as const,
    tenantSlug: 'test-tenant-a',
  },
  {
    email: 'admin-b@test.com',
    password: 'Test1234!',
    fullName: 'Admin Tenant B',
    role: 'admin' as const,
    tenantSlug: 'test-tenant-b',
  },
  {
    email: 'operator@test.com',
    password: 'Test1234!',
    fullName: 'Operator Test',
    role: 'operator' as const,
    tenantSlug: 'test-tenant-a',
  },
  {
    email: 'viewer@test.com',
    password: 'Test1234!',
    fullName: 'Viewer Test',
    role: 'viewer' as const,
    tenantSlug: 'test-tenant-a',
  },
  {
    email: 'member@test.com',
    password: 'Test1234!',
    fullName: 'Member Test',
    role: 'member' as const,
    tenantSlug: 'test-tenant-a',
  },
];

// Test tenants configuration
const SECURITY_TEST_TENANTS = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Test Tenant A',
    slug: 'test-tenant-a',
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    name: 'Test Tenant B',
    slug: 'test-tenant-b',
  },
];

async function createOrGetUser(email: string, password: string, fullName: string): Promise<string | null> {
  console.log(`\n📧 Processing user: ${email}`);

  // Check if user exists
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = existingUsers?.users.find((u) => u.email === email);

  if (existingUser) {
    console.log(`  ✅ User already exists: ${existingUser.id}`);
    return existingUser.id;
  }

  // Create new user
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error) {
    console.error(`  ❌ Error creating user: ${error.message}`);
    return null;
  }

  console.log(`  ✅ User created: ${data.user.id}`);
  return data.user.id;
}

async function ensureTenantExists(tenant: typeof SECURITY_TEST_TENANTS[0], ownerUserId: string): Promise<boolean> {
  console.log(`\n🏢 Processing tenant: ${tenant.name}`);

  // Check if tenant exists
  const { data: existingTenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', tenant.slug)
    .single();

  if (existingTenant) {
    console.log(`  ✅ Tenant already exists: ${existingTenant.id}`);
    return true;
  }

  // Create tenant
  const { error } = await supabaseAdmin
    .from('tenants')
    .insert({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      owner_user_id: ownerUserId,
    });

  if (error) {
    console.error(`  ❌ Error creating tenant: ${error.message}`);
    return false;
  }

  console.log(`  ✅ Tenant created: ${tenant.id}`);
  return true;
}

async function assignUserRole(
  userId: string, 
  tenantId: string, 
  role: string
): Promise<boolean> {
  console.log(`  🔑 Assigning role '${role}' to user in tenant ${tenantId}`);

  // Check if role already exists
  const { data: existingRole } = await supabaseAdmin
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .single();

  if (existingRole) {
    // Update existing role
    const { error } = await supabaseAdmin
      .from('user_roles')
      .update({ role })
      .eq('user_id', userId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error(`    ❌ Error updating role: ${error.message}`);
      return false;
    }
    console.log(`    ✅ Role updated`);
    return true;
  }

  // Create new role
  const { error } = await supabaseAdmin
    .from('user_roles')
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      role,
    });

  if (error) {
    console.error(`    ❌ Error creating role: ${error.message}`);
    return false;
  }

  console.log(`    ✅ Role assigned`);
  return true;
}

async function ensureProfileExists(userId: string, fullName: string): Promise<boolean> {
  // Check if profile exists
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (existingProfile) {
    return true;
  }

  // Create profile
  const { error } = await supabaseAdmin
    .from('profiles')
    .insert({
      user_id: userId,
      full_name: fullName,
    });

  if (error) {
    console.error(`    ❌ Error creating profile: ${error.message}`);
    return false;
  }

  return true;
}

async function main() {
  console.log('🔐 Setting up Security Test Users\n');
  console.log('='.repeat(50));

  try {
    // Step 1: Create all users and store their IDs
    const userIds: Map<string, string> = new Map();
    
    console.log('\n📋 Step 1: Creating users...');
    for (const user of SECURITY_TEST_USERS) {
      const userId = await createOrGetUser(user.email, user.password, user.fullName);
      if (userId) {
        userIds.set(user.email, userId);
        await ensureProfileExists(userId, user.fullName);
      }
    }

    // Step 2: Create tenants (using first admin as owner)
    console.log('\n📋 Step 2: Creating tenants...');
    const firstAdminId = userIds.get('admin@test.com');
    if (!firstAdminId) {
      throw new Error('Admin user not created');
    }

    for (const tenant of SECURITY_TEST_TENANTS) {
      await ensureTenantExists(tenant, firstAdminId);
    }

    // Step 3: Assign roles to users
    console.log('\n📋 Step 3: Assigning roles...');
    for (const user of SECURITY_TEST_USERS) {
      const userId = userIds.get(user.email);
      if (!userId) continue;

      const tenant = SECURITY_TEST_TENANTS.find(t => t.slug === user.tenantSlug);
      if (!tenant) continue;

      await assignUserRole(userId, tenant.id, user.role);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ Setup completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   Users created/verified: ${userIds.size}`);
    console.log(`   Tenants created/verified: ${SECURITY_TEST_TENANTS.length}`);
    
    console.log('\n📧 Test Users:');
    for (const user of SECURITY_TEST_USERS) {
      console.log(`   - ${user.email} (${user.role})`);
    }

    console.log('\n🏢 Test Tenants:');
    for (const tenant of SECURITY_TEST_TENANTS) {
      console.log(`   - ${tenant.name} (${tenant.slug})`);
    }

    console.log('\n🧪 Next Steps:');
    console.log('   1. Run security E2E tests:');
    console.log('      npx playwright test red-team-security');
    console.log('   2. Run all security tests:');
    console.log('      npx playwright test red-team security-invariants rls-cross-tenant');

  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
