import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user's tenant
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (roleError || !userRoles) {
      throw new Error('No tenant found for user');
    }

    const tenantId = userRoles.tenant_id;

    // Parse query parameters
    const url = new URL(req.url);
    const agentId = url.searchParams.get('agent_id');
    const format = url.searchParams.get('format') || 'json'; // json or summary

    // Build query filters
    let agentFilter = {};
    if (agentId) {
      agentFilter = { agent_id: agentId };
    }

    // Fetch all security data
    const [
      { data: agents },
      { data: software },
      { data: vulnerabilities },
      { data: antivirus },
      { data: webActivity },
      { data: virusScans },
      { data: securityEvents },
    ] = await Promise.all([
      supabase
        .from('agents')
        .select('id, agent_name, hostname, os_type, os_version, status, last_heartbeat')
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
      
      supabase
        .from('software_inventory')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentFilter),
      
      supabase
        .from('vuln_findings')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentFilter),
      
      supabase
        .from('antivirus_status')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentFilter),
      
      supabase
        .from('agent_web_activity')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentFilter)
        .order('visited_at', { ascending: false })
        .limit(100),
      
      supabase
        .from('virus_scans')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentId ? { agent_name: agentId } : {})
        .order('scanned_at', { ascending: false })
        .limit(50),
      
      supabase
        .from('security_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .match(agentFilter)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    // Calculate statistics
    const stats = {
      total_agents: agents?.length || 0,
      total_software: software?.length || 0,
      total_vulnerabilities: vulnerabilities?.length || 0,
      critical_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'critical').length || 0,
      high_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'high').length || 0,
      antivirus_engines: antivirus?.length || 0,
      threats_found: antivirus?.reduce((sum, av) => sum + (av.threats_found || 0), 0) || 0,
      unique_domains: new Set(webActivity?.map(w => w.domain)).size || 0,
      malicious_scans: virusScans?.filter(s => s.is_malicious).length || 0,
      total_scans: virusScans?.length || 0,
      security_events: securityEvents?.length || 0,
    };

    if (format === 'summary') {
      // Return compact summary
      return new Response(
        JSON.stringify({
          generated_at: new Date().toISOString(),
          tenant_id: tenantId,
          agent_filter: agentId || 'all',
          statistics: stats,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Return full detailed report
    const report = {
      generated_at: new Date().toISOString(),
      tenant_id: tenantId,
      agent_filter: agentId || 'all',
      statistics: stats,
      data: {
        agents: agents || [],
        software_inventory: software || [],
        vulnerabilities: vulnerabilities || [],
        antivirus_status: antivirus || [],
        web_activity: webActivity || [],
        virus_scans: virusScans || [],
        security_events: securityEvents || [],
      },
    };

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating security report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
