import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, agent_name, tenant_id')
      .eq('status', 'active')
      .gt('last_heartbeat', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .limit(1)
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ success: false, error: 'No online agent found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const testJobs = [
      { type: 'service_health_check', payload: {} },
      { type: 'network_diagnostics', payload: {} },
      { type: 'disk_cleanup', payload: {} },
    ];

    const created = [];
    for (const spec of testJobs) {
      const { data: job, error } = await supabase.from('jobs').insert({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        tenant_id: agent.tenant_id,
        type: spec.type,
        status: 'pending',
        payload: spec.payload,
        priority: 2,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }).select('id, type, status').single();

      if (!error && job) created.push(job);
    }

    return new Response(JSON.stringify({
      success: true,
      agent: agent.agent_name,
      jobs_created: created.length,
      jobs: created,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
