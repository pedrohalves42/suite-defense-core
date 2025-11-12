import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar tenant do usuário (limit 1 pois usuário pode ter múltiplos roles no mesmo tenant)
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!userRole) {
      return new Response(JSON.stringify({ error: 'No tenant found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar dados consolidados usando a função do banco
    const { data: agentsWithMetrics, error: metricsError } = await supabase
      .rpc('get_latest_agent_metrics', { p_tenant_id: userRole.tenant_id });

    if (metricsError) {
      console.error('[get-agent-dashboard-data] Metrics error:', metricsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch metrics' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar alertas não reconhecidos
    const { data: recentAlerts, error: alertsError } = await supabase
      .from('system_alerts')
      .select('*')
      .eq('tenant_id', userRole.tenant_id)
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (alertsError) {
      console.error('[get-agent-dashboard-data] Alerts error:', alertsError);
    }

    // Calcular estatísticas agregadas
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    let totalAgents = 0;
    let onlineAgents = 0;
    let offlineAgents = 0;
    let windowsAgents = 0;
    let linuxAgents = 0;
    let totalCpu = 0;
    let totalMemory = 0;
    let totalDisk = 0;
    let metricsCount = 0;

    const agents = (agentsWithMetrics || []).map((agent: any) => {
      totalAgents++;
      
      const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat) : null;
      const isOnline = lastHeartbeat && lastHeartbeat >= twoMinutesAgo;
      
      if (isOnline) {
        onlineAgents++;
      } else {
        offlineAgents++;
      }

      if (agent.os_type === 'windows') {
        windowsAgents++;
      } else if (agent.os_type === 'linux') {
        linuxAgents++;
      }

      if (agent.cpu_usage_percent !== null) {
        totalCpu += parseFloat(agent.cpu_usage_percent);
        metricsCount++;
      }
      if (agent.memory_usage_percent !== null) {
        totalMemory += parseFloat(agent.memory_usage_percent);
      }
      if (agent.disk_usage_percent !== null) {
        totalDisk += parseFloat(agent.disk_usage_percent);
      }

      return {
        id: agent.agent_id,
        name: agent.agent_name,
        os_type: agent.os_type || 'unknown',
        os_version: agent.os_version,
        hostname: agent.hostname,
        status: agent.status,
        last_heartbeat: agent.last_heartbeat,
        is_online: isOnline,
        cpu_usage: agent.cpu_usage_percent ? parseFloat(agent.cpu_usage_percent) : null,
        memory_usage: agent.memory_usage_percent ? parseFloat(agent.memory_usage_percent) : null,
        disk_usage: agent.disk_usage_percent ? parseFloat(agent.disk_usage_percent) : null,
        uptime_hours: agent.uptime_seconds ? Math.floor(agent.uptime_seconds / 3600) : null,
        metrics_age_minutes: agent.metrics_age_minutes,
      };
    });

    // Contar alertas por severidade
    const criticalAlerts = (recentAlerts || []).filter((a: any) => a.severity === 'critical').length;
    const highAlerts = (recentAlerts || []).filter((a: any) => a.severity === 'high').length;

    const summary = {
      total_agents: totalAgents,
      online_agents: onlineAgents,
      offline_agents: offlineAgents,
      windows_agents: windowsAgents,
      linux_agents: linuxAgents,
      avg_cpu_usage: metricsCount > 0 ? (totalCpu / metricsCount).toFixed(1) : null,
      avg_memory_usage: metricsCount > 0 ? (totalMemory / metricsCount).toFixed(1) : null,
      avg_disk_usage: metricsCount > 0 ? (totalDisk / metricsCount).toFixed(1) : null,
      critical_alerts: criticalAlerts,
      high_alerts: highAlerts,
    };

    return new Response(
      JSON.stringify({
        summary,
        agents,
        recent_alerts: recentAlerts || [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[get-agent-dashboard-data] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
