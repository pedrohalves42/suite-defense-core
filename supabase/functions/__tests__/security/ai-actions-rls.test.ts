
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * AI Actions RLS Test
 * Verifies that authenticated users are restricted to their own tenant data.
 */
Deno.test("Security: ai_actions RLS prevents cross-tenant access", async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Setup test data
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const userA = crypto.randomUUID();
  
  // Create tenants and roles
  await supabase.from('tenants').insert([{ id: tenantA, name: 'Test Tenant A' }, { id: tenantB, name: 'Test Tenant B' }]);
  await supabase.from('user_roles').insert([
    { user_id: userA, tenant_id: tenantA, role: 'analyst' }
  ]);
  
  // Create actions for both
  await supabase.from('ai_actions').insert([
    { id: crypto.randomUUID(), tenant_id: tenantA, action_type: 'test_a', status: 'pending' },
    { id: crypto.randomUUID(), tenant_id: tenantB, action_type: 'test_b', status: 'pending' }
  ]);

  try {
    // 2. Simulate User A access using a database function or by temporarily setting claims if possible
    // Since we can't easily "sign in" as userA in this environment without auth setup,
    // we use an RPC that mimics the RLS check logic or we verify the policy definition.
    
    // For this test environment, we'll verify via a specialized test function that runs as 'authenticated'
    const { data, error } = await supabase.rpc('test_rls_isolation', { 
      target_user_id: userA,
      target_table: 'ai_actions'
    });

    if (error) throw error;

    // The RPC should return only rows belonging to tenantA
    const crossTenantRows = data.filter((row: any) => row.tenant_id !== tenantA);
    assertEquals(crossTenantRows.length, 0, "Users should NOT be able to see actions from other tenants");
    
    const ownTenantRows = data.filter((row: any) => row.tenant_id === tenantA);
    assertEquals(ownTenantRows.length > 0, true, "Users should be able to see actions from their own tenant");

  } finally {
    // Cleanup
    await supabase.from('ai_actions').delete().eq('tenant_id', tenantA);
    await supabase.from('ai_actions').delete().eq('tenant_id', tenantB);
    await supabase.from('user_roles').delete().eq('user_id', userA);
    await supabase.from('tenants').delete().in('id', [tenantA, tenantB]);
  }
});
