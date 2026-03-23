import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user tenant with admin/operator role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'super_admin', 'operator'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!userRole) {
      return new Response(JSON.stringify({ error: 'Admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tenantId = userRole.tenant_id;

    // Fetch high/critical threat nodes (risk_score >= 80) of type domain or ip
    const { data: dangerousNodes, error: nodesError } = await supabase
      .from('security_graph_nodes')
      .select('id, node_type, node_value, label, risk_score, metadata')
      .eq('tenant_id', tenantId)
      .gte('risk_score', 80)
      .in('node_type', ['domain', 'ip', 'url']);

    if (nodesError) throw nodesError;
    if (!dangerousNodes || dangerousNodes.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Nenhum item perigoso encontrado para bloquear',
        blocked: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get already blocked domains for this tenant
    const { data: existingBlocked } = await supabase
      .from('blocked_websites')
      .select('domain_pattern')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const alreadyBlocked = new Set(
      (existingBlocked || []).map(b => b.domain_pattern.toLowerCase())
    );

    // Filter out already blocked
    const toBlock = dangerousNodes.filter(
      n => !alreadyBlocked.has(n.node_value.toLowerCase())
    );

    if (toBlock.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Todos os itens perigosos já estão bloqueados',
        blocked: 0,
        already_blocked: dangerousNodes.length,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert into blocked_websites
    const insertData = toBlock.map(node => {
      const meta = node.metadata as any;
      const sourceInfo = meta?.source || 'threat_intelligence';
      return {
        tenant_id: tenantId,
        domain_pattern: node.node_value.toLowerCase(),
        reason: `Bloqueio automático: ${meta?.threat_type || 'ameaça detectada'} (fonte: ${sourceInfo}, risco: ${node.risk_score}%)`,
        blocked_by: user.id,
        is_active: true,
      };
    });

    const { data: blocked, error: insertError } = await supabase
      .from('blocked_websites')
      .upsert(insertData, {
        onConflict: 'tenant_id,domain_pattern',
        ignoreDuplicates: true,
      })
      .select('id');

    // If upsert not supported by constraint, fallback to individual inserts
    let blockedCount = blocked?.length || 0;
    if (insertError) {
      console.warn('Upsert failed, falling back to individual inserts:', insertError.message);
      blockedCount = 0;
      for (const item of insertData) {
        const { error: singleErr } = await supabase
          .from('blocked_websites')
          .insert(item);
        if (!singleErr) blockedCount++;
      }
    }

    // Sync with online agents
    let syncResult = { jobs_created: 0 };
    if (blockedCount > 0) {
      try {
        // Call sync function internally
        const fiveMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: agents } = await supabase
          .from('agents')
          .select('id, agent_name')
          .eq('tenant_id', tenantId)
          .gt('last_heartbeat', fiveMinutesAgo);

        if (agents && agents.length > 0) {
          // Fetch full blocked list
          const { data: allBlocked } = await supabase
            .from('blocked_websites')
            .select('domain_pattern')
            .eq('tenant_id', tenantId)
            .eq('is_active', true);

          const blockedDomains = (allBlocked || []).map(s => s.domain_pattern);

          // Cancel old sync jobs
          const agentIds = agents.map(a => a.id);
          await supabase
            .from('jobs')
            .update({ status: 'cancelled', error_message: 'Superseded by auto-block sync' })
            .eq('type', 'sync_blocked_websites')
            .eq('tenant_id', tenantId)
            .in('agent_id', agentIds)
            .in('status', ['pending', 'queued', 'delivered']);

          // Create sync jobs
          const jobsToCreate = agents.map(agent => ({
            agent_id: agent.id,
            agent_name: agent.agent_name,
            tenant_id: tenantId,
            type: 'sync_blocked_websites',
            status: 'queued',
            priority: 1, // High priority for threat blocking
            approved: true,
            payload: {
              blocked_domains: blockedDomains,
              action: 'sync',
              apply_to_hosts: true,
              flush_dns: true,
              source: 'auto_block_threats',
              timestamp: new Date().toISOString(),
            },
          }));

          const { data: createdJobs } = await supabase
            .from('jobs')
            .insert(jobsToCreate)
            .select('id');

          syncResult.jobs_created = createdJobs?.length || 0;
        }
      } catch (syncErr) {
        console.error('Sync error (non-fatal):', syncErr);
      }

      // Create system alert
      await supabase.from('system_alerts').insert({
        tenant_id: tenantId,
        alert_type: 'security',
        severity: 'high',
        title: 'Bloqueio Automático de Ameaças',
        message: `${blockedCount} domínio(s)/IP(s) perigosos foram bloqueados automaticamente e sincronizados com ${syncResult.jobs_created} agente(s).`,
        details: {
          blocked_items: toBlock.map(n => n.node_value),
          jobs_created: syncResult.jobs_created,
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      blocked: blockedCount,
      already_blocked: dangerousNodes.length - toBlock.length,
      synced_agents: syncResult.jobs_created,
      blocked_items: toBlock.map(n => ({
        value: n.node_value,
        type: n.node_type,
        risk_score: n.risk_score,
      })),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[auto-block-threats] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
