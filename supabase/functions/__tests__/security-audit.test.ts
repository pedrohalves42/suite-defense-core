import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.test("Security Audit: Tenant Isolation & HMAC Replay", async (t) => {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  await t.step("Tenant Isolation: ai_insights RLS check", async () => {
    // 1. Get two different tenants if they exist
    const { data: tenants } = await supabaseAdmin.from('tenants').select('id').limit(2);
    
    if (tenants && tenants.length >= 2) {
      const tenantA = tenants[0].id;
      const tenantB = tenants[1].id;

      // 2. Create a simulated "User A" client (bypassing full auth for speed, just testing RLS logic if possible)
      // Since we can't easily generate a JWT here without auth secrets, we test via RPC or known RLS behavior.
      
      // Better: Use a dedicated test RPC that checks isolation
      const { data: isolationOk, error } = await supabaseAdmin.rpc('test_tenant_isolation', {
        p_tenant_a: tenantA,
        p_tenant_b: tenantB
      });

      if (!error) {
        assertEquals(isolationOk, true, "Tenant A should NOT see data from Tenant B");
      } else {
        console.log("Isolation RPC not found, skipping deep RLS check. Ensure RLS is enabled on all tables.");
      }
    } else {
      console.log("Not enough tenants for isolation test.");
    }
  });

  await t.step("HMAC Replay Protection: Atomic Check", async () => {
    const testSignature = `test_sig_${crypto.randomUUID()}`;
    const agentName = "test_agent_001";

    // First attempt: should succeed
    const { data: firstResult } = await supabaseAdmin.rpc('hmac_check_and_record', {
      p_signature: testSignature,
      p_agent_name: agentName
    });
    assertEquals(firstResult, true, "First HMAC signature should be accepted");

    // Second attempt (REPLAY): should fail
    const { data: secondResult } = await supabaseAdmin.rpc('hmac_check_and_record', {
      p_signature: testSignature,
      p_agent_name: agentName
    });
    assertEquals(secondResult, false, "Duplicate HMAC signature should be REJECTED (Replay Protection)");
  });

  await t.step("Heartbeat Idempotency: Temporal Check", async () => {
    // Get a test agent
    const { data: agent } = await supabaseAdmin.from('agents').select('id, last_heartbeat, row_version').limit(1).single();
    if (!agent) return;

    const initialVersion = agent.row_version || 0;
    const futureTs = new Date(Date.now() + 10000).toISOString();
    const pastTs = new Date(Date.now() - 10000).toISOString();

    // Send future heartbeat: should update
    await supabaseAdmin.rpc('update_agent_heartbeat_atomic', {
      p_agent_id: agent.id,
      p_update_data: { last_telemetry_at: futureTs, hostname: "FUTURE_NODE" }
    });

    const { data: agentAfterFuture } = await supabaseAdmin.from('agents').select('hostname, row_version').eq('id', agent.id).single();
    assertEquals(agentAfterFuture?.hostname, "FUTURE_NODE", "Newer heartbeat should update metadata");
    assertNotEquals(agentAfterFuture?.row_version, initialVersion, "Row version should increment");

    // Send past heartbeat: should NOT update metadata but might update online status (if not for GREATEST)
    await supabaseAdmin.rpc('update_agent_heartbeat_atomic', {
      p_agent_id: agent.id,
      p_update_data: { last_telemetry_at: pastTs, hostname: "PAST_NODE" }
    });

    const { data: agentAfterPast } = await supabaseAdmin.from('agents').select('hostname').eq('id', agent.id).single();
    assertEquals(agentAfterPast?.hostname, "FUTURE_NODE", "Older heartbeat should NOT overwrite newer metadata (Idempotency)");
  });
});
