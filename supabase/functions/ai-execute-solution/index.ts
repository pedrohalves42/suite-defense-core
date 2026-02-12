import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ExecuteSolutionRequest {
  action_id: string;
  solution_type: string;
  parameters?: Record<string, any>;
}

Deno.serve(async (req) => {
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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { action_id, solution_type, parameters = {} } = await req.json() as ExecuteSolutionRequest;

    console.log(`[AI-EXECUTE-SOLUTION] Executing ${solution_type} for action ${action_id}`);

    // Get action details
    const { data: action, error: actionError } = await supabase
      .from('ai_actions')
      .select('*, ai_insights(*)')
      .eq('id', action_id)
      .single();

    if (actionError || !action) {
      throw new Error('Action not found');
    }

    const tenant_id = action.tenant_id;
    let result: any = {};
    let success = true;
    let error_message = null;

    // Execute solution based on type
    switch (solution_type) {
      case 'cleanup_stuck_jobs': {
        const { data: cleanupResult, error } = await supabase
          .rpc('cleanup_stuck_jobs');
        
        if (error) throw error;
        result = {
          cleaned_count: cleanupResult?.[0]?.cleaned_count || 0,
          job_ids: cleanupResult?.[0]?.job_ids || []
        };
        break;
      }

      case 'acknowledge_alerts': {
        const { data: ackResult, error } = await supabase
          .rpc('acknowledge_all_alerts', { p_tenant_id: tenant_id });
        
        if (error) throw error;
        result = ackResult;
        break;
      }

      case 'create_security_jobs': {
        // Get all ONLINE active agents for this tenant (heartbeat within 10 min)
        const onlineThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: agents, error: agentsError } = await supabase
          .from('agents')
          .select('id, agent_name')
          .eq('tenant_id', tenant_id)
          .eq('status', 'active')
          .gte('last_heartbeat', onlineThreshold);

        if (agentsError) throw agentsError;

        const securityJobs = ['software_inventory_collect', 'collect_antivirus_status', 'collect_web_activity', 'light_vuln_scan'];
        const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
        const jobsToCreate = [];

        for (const agent of agents || []) {
          for (const jobType of securityJobs) {
            jobsToCreate.push({
              tenant_id,
              agent_id: agent.id,
              agent_name: agent.agent_name,
              type: jobType,
              status: 'queued',
              approved: true,
              payload: {},
              expires_at: expiresAt,
            });
          }
        }

        if (jobsToCreate.length > 0) {
          const { error: jobsError } = await supabase
            .from('jobs')
            .insert(jobsToCreate);

          if (jobsError) throw jobsError;
        }

        result = {
          jobs_created: jobsToCreate.length,
          agents_count: agents?.length || 0
        };
        break;
      }

      case 'restart_agent_collection': {
        const agent_id = parameters.agent_id;
        
        if (!agent_id) {
          throw new Error('agent_id required for restart_agent_collection');
        }

        const { data: agent } = await supabase
          .from('agents')
          .select('agent_name')
          .eq('id', agent_id)
          .eq('tenant_id', tenant_id)
          .single();

        if (!agent) throw new Error('Agent not found');

        // Create collection jobs for this specific agent
        const securityJobs = ['software_inventory_collect', 'collect_antivirus_status', 'collect_web_activity', 'light_vuln_scan'];
        const expiresAt2 = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
        const jobsToCreate = securityJobs.map(jobType => ({
          tenant_id,
          agent_id,
          agent_name: agent.agent_name,
          type: jobType,
          status: 'queued',
          approved: true,
          payload: {},
          expires_at: expiresAt2,
        }));

        const { error: jobsError } = await supabase
          .from('jobs')
          .insert(jobsToCreate);

        if (jobsError) throw jobsError;

        result = {
          jobs_created: jobsToCreate.length,
          agent_name: agent.agent_name
        };
        break;
      }

      case 'cleanup_old_data': {
        const days = parameters.days || 7;
        
        // Clean old failed/stuck jobs
        const { data: deletedJobs } = await supabase
          .from('jobs')
          .delete()
          .eq('tenant_id', tenant_id)
          .in('status', ['failed', 'stuck'])
          .lt('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
          .select('id');

        result = {
          deleted_jobs: deletedJobs?.length || 0,
          days_threshold: days
        };
        break;
      }

      default:
        throw new Error(`Unknown solution type: ${solution_type}`);
    }

    // Update action status
    await supabase
      .from('ai_actions')
      .update({
        status: success ? 'completed' : 'failed',
        executed_at: new Date().toISOString(),
        result,
        error_message
      })
      .eq('id', action_id);

    console.log(`[AI-EXECUTE-SOLUTION] Solution ${solution_type} executed successfully`);

    return new Response(
      JSON.stringify({ 
        success: true,
        solution_type,
        result
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[AI-EXECUTE-SOLUTION] Error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
