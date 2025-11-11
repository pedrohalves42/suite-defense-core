import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SystemMetrics {
  cpu_usage_percent?: number;
  cpu_name?: string;
  cpu_cores?: number;
  memory_total_gb?: number;
  memory_used_gb?: number;
  memory_free_gb?: number;
  memory_usage_percent?: number;
  disk_total_gb?: number;
  disk_used_gb?: number;
  disk_free_gb?: number;
  disk_usage_percent?: number;
  network_bytes_sent?: number;
  network_bytes_received?: number;
  uptime_seconds?: number;
  last_boot_time?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Autenticação via HMAC
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(JSON.stringify({ error: 'Missing agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar agente
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, agent_name, tenant_id, hmac_secret')
      .eq('agent_name', agentToken)
      .single();

    if (agentError || !agent) {
      console.error('[submit-system-metrics] Agent not found:', agentToken);
      return new Response(JSON.stringify({ error: 'Invalid agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validar HMAC se configurado
    if (agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret);
      if (!hmacResult.valid) {
        return new Response(JSON.stringify({ error: hmacResult.error || 'Invalid HMAC signature' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Rate limiting: 60 req/hora (1 a cada minuto)
    const rateLimitKey = `metrics:${agent.agent_name}`;
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, 'submit-system-metrics', {
      maxRequests: 60,
      windowMinutes: 60,
      blockMinutes: 10,
    });
    
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded', 
          resetAt: rateLimitResult.resetAt 
        }), 
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse métricas
    const metrics: SystemMetrics = await req.json();

    // Inserir métricas no banco
    const { error: insertError } = await supabase
      .from('agent_system_metrics')
      .insert({
        agent_id: agent.id,
        tenant_id: agent.tenant_id,
        cpu_usage_percent: metrics.cpu_usage_percent,
        cpu_name: metrics.cpu_name,
        cpu_cores: metrics.cpu_cores,
        memory_total_gb: metrics.memory_total_gb,
        memory_used_gb: metrics.memory_used_gb,
        memory_free_gb: metrics.memory_free_gb,
        memory_usage_percent: metrics.memory_usage_percent,
        disk_total_gb: metrics.disk_total_gb,
        disk_used_gb: metrics.disk_used_gb,
        disk_free_gb: metrics.disk_free_gb,
        disk_usage_percent: metrics.disk_usage_percent,
        network_bytes_sent: metrics.network_bytes_sent,
        network_bytes_received: metrics.network_bytes_received,
        uptime_seconds: metrics.uptime_seconds,
        last_boot_time: metrics.last_boot_time ? new Date(metrics.last_boot_time).toISOString() : null,
      });

    if (insertError) {
      console.error('[submit-system-metrics] Insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to store metrics' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Gerar alertas se thresholds ultrapassados
    const alerts = [];

    if (metrics.cpu_usage_percent && metrics.cpu_usage_percent > 90) {
      alerts.push({
        tenant_id: agent.tenant_id,
        agent_id: agent.id,
        alert_type: 'high_cpu',
        severity: 'critical',
        title: `CPU Crítico: ${agent.agent_name}`,
        message: `Uso de CPU em ${metrics.cpu_usage_percent.toFixed(1)}% (limite: 90%)`,
        details: { cpu_usage: metrics.cpu_usage_percent },
      });
    }

    if (metrics.memory_usage_percent && metrics.memory_usage_percent > 85) {
      alerts.push({
        tenant_id: agent.tenant_id,
        agent_id: agent.id,
        alert_type: 'high_memory',
        severity: 'high',
        title: `Memória Alta: ${agent.agent_name}`,
        message: `Uso de memória em ${metrics.memory_usage_percent.toFixed(1)}% (limite: 85%)`,
        details: { memory_usage: metrics.memory_usage_percent },
      });
    }

    if (metrics.disk_usage_percent && metrics.disk_usage_percent > 90) {
      alerts.push({
        tenant_id: agent.tenant_id,
        agent_id: agent.id,
        alert_type: 'high_disk',
        severity: 'critical',
        title: `Disco Crítico: ${agent.agent_name}`,
        message: `Uso de disco em ${metrics.disk_usage_percent.toFixed(1)}% (limite: 90%)`,
        details: { disk_usage: metrics.disk_usage_percent },
      });
    }

    if (alerts.length > 0) {
      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert(alerts);

      if (alertError) {
        console.error('[submit-system-metrics] Alert insert error:', alertError);
      }
    }

    console.log(`[submit-system-metrics] ✅ Metrics stored for ${agent.agent_name}, ${alerts.length} alerts generated`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        alerts_generated: alerts.length 
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[submit-system-metrics] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
