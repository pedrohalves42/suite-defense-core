import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';

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

    // Autenticacao via HMAC
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(JSON.stringify({ error: 'Missing agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar agente via token (CORRIGIDO)
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select(`
        agent_id,
        is_active,
        agents (
          id,
          agent_name,
          tenant_id,
          hmac_secret,
          status
        )
      `)
      .eq('token', agentToken)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenData || !tokenData.agents) {
      logger.warn('Invalid agent token');
      return new Response(JSON.stringify({ error: 'Invalid agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agent = tokenData.agents as any;

    // Validar HMAC se configurado
    if (agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret);
      if (!hmacResult.valid) {
        return new Response(
          JSON.stringify({ 
            error: 'unauthorized',
            code: hmacResult.errorCode,
            message: hmacResult.errorMessage,
            transient: hmacResult.transient
          }), 
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
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

    logger.debug('Parsing metrics request');
    // Parse metricas
    const metrics: SystemMetrics = await req.json();
    logger.debug('Received metrics', {
      cpu: metrics.cpu_usage_percent,
      memory: metrics.memory_usage_percent,
      disk: metrics.disk_usage_percent
    });

    logger.debug('Inserting metrics into database');
    // Inserir metricas no banco
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
      logger.error('Failed to insert metrics', insertError);
      return new Response(JSON.stringify({ error: 'Failed to store metrics' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    logger.success('Metrics stored successfully');

    logger.debug('Checking alert thresholds');
    // Gerar alertas se thresholds ultrapassados (com verificacao de duplicatas e cooldown)
    const alerts = [];
    const ALERT_COOLDOWN_MINUTES = 60; // 1 hora de cooldown

    // Verificar alertas existentes nas ultimas 24h
    const { data: existingAlerts } = await supabase
      .from('system_alerts')
      .select('alert_type, created_at, resolved')
      .eq('agent_id', agent.id)
      .eq('tenant_id', agent.tenant_id)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const hasRecentAlert = (type: string) => {
      if (!existingAlerts) return false;
      
      const recentAlert = existingAlerts.find(
        (alert) => 
          alert.alert_type === type && 
          !alert.resolved &&
          new Date(alert.created_at).getTime() > Date.now() - ALERT_COOLDOWN_MINUTES * 60 * 1000
      );
      
      return !!recentAlert;
    };

    // CPU: Threshold 95% (increased from 90%)
    if (metrics.cpu_usage_percent && metrics.cpu_usage_percent > 95) {
      if (!hasRecentAlert('high_cpu')) {
        logger.info('High CPU usage detected');
        alerts.push({
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          alert_type: 'high_cpu',
          severity: 'critical',
          title: `CPU Critico: ${agent.agent_name}`,
          message: `Uso de CPU em ${metrics.cpu_usage_percent.toFixed(1)}% (limite: 95%)`,
          details: { cpu_usage: metrics.cpu_usage_percent },
        });
      }
    }

    // Memory: Threshold 90% (increased from 85%)
    if (metrics.memory_usage_percent && metrics.memory_usage_percent > 90) {
      if (!hasRecentAlert('high_memory')) {
        logger.info('High memory usage detected');
        alerts.push({
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          alert_type: 'high_memory',
          severity: 'high',
          title: `Memoria Alta: ${agent.agent_name}`,
          message: `Uso de memoria em ${metrics.memory_usage_percent.toFixed(1)}% (limite: 90%)`,
          details: { memory_usage: metrics.memory_usage_percent },
        });
      }
    }

    // Disk: Threshold 95% (increased from 90%)
    if (metrics.disk_usage_percent && metrics.disk_usage_percent > 95) {
      if (!hasRecentAlert('high_disk')) {
        logger.info('High disk usage detected');
        alerts.push({
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          alert_type: 'high_disk',
          severity: 'critical',
          title: `Disco Critico: ${agent.agent_name}`,
          message: `Uso de disco em ${metrics.disk_usage_percent.toFixed(1)}% (limite: 95%)`,
          details: { disk_usage: metrics.disk_usage_percent },
        });
      }
    }

    // Memory Warning: Threshold 80% - Alerta preventivo para otimizacao
    if (metrics.memory_usage_percent && metrics.memory_usage_percent > 80 && metrics.memory_usage_percent <= 90) {
      if (!hasRecentAlert('memory_warning')) {
        logger.info('Memory warning threshold reached');
        alerts.push({
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          alert_type: 'memory_warning',
          severity: 'medium',
          title: `Memoria Elevada: ${agent.agent_name}`,
          message: `Uso de memoria em ${metrics.memory_usage_percent.toFixed(1)}% - considerar otimizacao`,
          details: { 
            memory_usage: metrics.memory_usage_percent,
            memory_used_gb: metrics.memory_used_gb,
            memory_total_gb: metrics.memory_total_gb,
            recommendation: 'Monitorar tendencia de crescimento. Considerar otimizacao se aproximar de 90%.'
          },
        });
      }
    }

    if (alerts.length > 0) {
      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert(alerts);

      if (alertError) {
        logger.error('Failed to insert alerts', alertError);
      } else {
        logger.info(`${alerts.length} alerts generated`);
      }
    }

    logger.success(`Metrics processed, ${alerts.length} alerts generated`);

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
    logger.error('Metrics submission failed', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
