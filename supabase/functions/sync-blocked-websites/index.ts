import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token to verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      logger.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant (use maybeSingle to handle users with multiple roles)
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'super_admin', 'operator'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roleError || !userRole) {
      logger.error('Role error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Access denied - admin/operator role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = userRole.tenant_id;

    // Fetch all active blocked websites for the tenant
    const { data: blockedSites, error: blockedError } = await supabase
      .from('blocked_websites')
      .select('domain_pattern')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (blockedError) {
      logger.error('Error fetching blocked websites:', blockedError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch blocked websites' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const blockedDomains = blockedSites?.map(s => s.domain_pattern) || [];
    logger.info(`[sync-blocked-websites] Found ${blockedDomains.length} blocked domains for tenant ${tenantId}`);

    // Fetch all online agents (last heartbeat within 30 minutes - unified threshold)
    const fiveMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, agent_name')
      .eq('tenant_id', tenantId)
      .gt('last_heartbeat', fiveMinutesAgo);

    if (agentsError) {
      logger.error('Error fetching agents:', agentsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch agents' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!agents || agents.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No online agents found',
          jobs_created: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`[sync-blocked-websites] Creating jobs for ${agents.length} online agents`);

    // Cancel any existing pending/queued/delivered sync jobs for these agents to avoid dedup constraint
    const agentIds = agents.map(a => a.id);
    const { error: cancelError } = await supabase
      .from('jobs')
      .update({ status: 'cancelled', error_message: 'Superseded by new sync request' })
      .eq('type', 'sync_blocked_websites')
      .eq('tenant_id', tenantId)
      .in('agent_id', agentIds)
      .in('status', ['pending', 'queued', 'delivered']);

    if (cancelError) {
      logger.warn('[sync-blocked-websites] Error cancelling old jobs:', cancelError);
    }

    // Create sync_blocked_websites job for each online agent
    const jobsToCreate = agents.map(agent => ({
      agent_id: agent.id,
      agent_name: agent.agent_name,
      tenant_id: tenantId,
      type: 'sync_blocked_websites',
      status: 'queued',
      priority: 2,
      approved: true,
      payload: {
        blocked_domains: blockedDomains,
        action: 'sync',
        apply_to_hosts: true,
        flush_dns: true,
        timestamp: new Date().toISOString()
      }
    }));

    const { data: createdJobs, error: jobsError } = await supabase
      .from('jobs')
      .insert(jobsToCreate)
      .select('id');

    if (jobsError) {
      logger.error('Error creating jobs:', jobsError);
      return new Response(
        JSON.stringify({ error: 'Failed to create sync jobs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`[sync-blocked-websites] Created ${createdJobs?.length || 0} jobs successfully`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sincronização agendada para ${agents.length} computadores`,
        jobs_created: createdJobs?.length || 0,
        blocked_domains_count: blockedDomains.length,
        agents: agents.map(a => a.agent_name)
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('[sync-blocked-websites] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
