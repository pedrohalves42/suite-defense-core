import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { hashToken } from '../_shared/token-hash.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Interface para informações de disco individual
interface DiskInfo {
  drive_letter: string;    // "C:", "D:", etc.
  drive_label?: string;    // "Sistema", "Dados", etc.
  drive_type?: string;     // "Fixed", "Removable", "Network"
  total_gb: number;
  used_gb: number;
  free_gb: number;
  usage_percent: number;
  is_system_drive?: boolean;
}

interface SystemMetrics {
  cpu_usage_percent?: number;
  cpu_name?: string;
  cpu_cores?: number;
  memory_total_gb?: number;
  memory_used_gb?: number;
  memory_free_gb?: number;
  memory_usage_percent?: number;
  // Campos de disco legado (compatibilidade com agentes antigos)
  disk_total_gb?: number;
  disk_used_gb?: number;
  disk_free_gb?: number;
  disk_usage_percent?: number;
  // NOVO: Array de discos para suporte a múltiplos discos
  disks?: DiskInfo[];
  network_bytes_sent?: number;
  network_bytes_received?: number;
  uptime_seconds?: number;
  last_boot_time?: string;
}

Deno.serve(async (req) => {
  // QUAL-01: Proper HTTP method validation
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }
  
  const methodError = validateHttpMethod(req, ['POST']);
  if (methodError) return methodError;

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

    // FASE 2: Buscar agente via hash do token
    const tokenHash = await hashToken(agentToken)
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
      .eq('token_hash', tokenHash)
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
    
    // Enhanced logging for debugging disk metrics (v4.0.11)
    logger.info('Received metrics payload', {
      agent: agent.agent_name,
      cpu: metrics.cpu_usage_percent,
      memory: metrics.memory_usage_percent,
      disk_legacy: metrics.disk_usage_percent,
      disk_total_gb: metrics.disk_total_gb,
      disk_free_gb: metrics.disk_free_gb,
      disks_count: metrics.disks?.length || 0,
      disks_drives: metrics.disks?.map(d => d.drive_letter).join(',') || 'none'
    });

    // Processar múltiplos discos se disponível, senão usar valores legado
    let primaryDisk = {
      total_gb: metrics.disk_total_gb,
      used_gb: metrics.disk_used_gb,
      free_gb: metrics.disk_free_gb,
      usage_percent: metrics.disk_usage_percent
    };

    // Se há múltiplos discos, encontrar o mais crítico para métricas principais
    if (metrics.disks && metrics.disks.length > 0) {
      const criticalDisk = metrics.disks.reduce((prev, curr) => 
        (curr.usage_percent > (prev.usage_percent || 0)) ? curr : prev
      );
      
      primaryDisk = {
        total_gb: criticalDisk.total_gb,
        used_gb: criticalDisk.used_gb,
        free_gb: criticalDisk.free_gb,
        usage_percent: criticalDisk.usage_percent
      };
      
      logger.debug('Multiple disks detected, using critical disk', {
        critical_drive: criticalDisk.drive_letter,
        usage_percent: criticalDisk.usage_percent,
        total_disks: metrics.disks.length
      });
    }

    logger.debug('Inserting metrics into database');
    // Inserir metricas no banco (usando disco mais crítico)
    const { error: insertError } = await supabase
      .from('agent_system_metrics_partitioned')
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
        disk_total_gb: primaryDisk.total_gb,
        disk_used_gb: primaryDisk.used_gb,
        disk_free_gb: primaryDisk.free_gb,
        disk_usage_percent: primaryDisk.usage_percent,
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
    
    // Inserir detalhes de cada disco na tabela dedicada
    if (metrics.disks && metrics.disks.length > 0) {
      const diskRecords = metrics.disks.map((disk: DiskInfo) => ({
        agent_id: agent.id,
        tenant_id: agent.tenant_id,
        drive_letter: disk.drive_letter,
        drive_label: disk.drive_label || null,
        drive_type: disk.drive_type || 'Fixed',
        total_gb: disk.total_gb,
        used_gb: disk.used_gb,
        free_gb: disk.free_gb,
        usage_percent: disk.usage_percent,
        is_system_drive: disk.is_system_drive || false,
      }));
      
      const { error: diskError } = await supabase
        .from('agent_disk_metrics')
        .insert(diskRecords);
      
      if (diskError) {
        logger.warn('Failed to insert disk metrics', diskError);
        // Não falhar a requisição inteira, apenas logar o erro
      } else {
        logger.debug(`Inserted ${diskRecords.length} disk metrics`);
      }
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

    // CPU: Threshold 98% (increased from 95% to reduce false positives from momentary spikes)
    if (metrics.cpu_usage_percent && metrics.cpu_usage_percent > 98) {
      if (!hasRecentAlert('high_cpu')) {
        logger.info('High CPU usage detected');
        alerts.push({
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          alert_type: 'high_cpu',
          severity: 'critical',
          title: `CPU Critico: ${agent.agent_name}`,
          message: `Uso de CPU em ${metrics.cpu_usage_percent.toFixed(1)}% (limite: 98%)`,
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

    // Disk: Threshold 97% (increased from 95% to reduce false positives)
    if (metrics.disk_usage_percent && metrics.disk_usage_percent > 97) {
      if (!hasRecentAlert('high_disk')) {
        logger.info('High disk usage detected');
        alerts.push({
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          alert_type: 'high_disk',
          severity: 'critical',
          title: `Disco Critico: ${agent.agent_name}`,
          message: `Uso de disco em ${metrics.disk_usage_percent.toFixed(1)}% (limite: 97%)`,
          details: { disk_usage: metrics.disk_usage_percent },
        });
      }
    }

    // Memory Warning: Threshold 85% - Alerta preventivo para otimizacao (otimizado v3.10.35)
    if (metrics.memory_usage_percent && metrics.memory_usage_percent > 85 && metrics.memory_usage_percent <= 90) {
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

    // FASE 2: Auto-resolução de alertas quando métricas normalizam
    const alertsToResolve: string[] = [];

    // CPU normalizou (< 90%)?
    if (metrics.cpu_usage_percent !== undefined && metrics.cpu_usage_percent < 90) {
      alertsToResolve.push('high_cpu');
    }

    // Memory normalizou (< 80%)?
    if (metrics.memory_usage_percent !== undefined && metrics.memory_usage_percent < 80) {
      alertsToResolve.push('high_memory', 'memory_warning');
    }

    // Disk normalizou (<= 95%)? Auto-resolve when below trigger threshold
    if (metrics.disk_usage_percent !== undefined && metrics.disk_usage_percent <= 95) {
      alertsToResolve.push('high_disk');
    }

    if (alertsToResolve.length > 0) {
      const now = new Date().toISOString();

      // ADR-029 FIX: Alertas críticos requerem resolução humana (resolved_by obrigatório)
      // Só resolver automaticamente alertas que NÃO são críticos
      // Isso respeita o trigger enforce_critical_alert_human_review
      // Usando filtro explícito com severity IN ('low','medium','high') para evitar críticos
      const { error: resolveError, count: resolvedCount } = await supabase
        .from('system_alerts')
        .update({ 
          resolved: true, 
          resolved_at: now,
          resolution_notes: 'Auto-resolved: metric returned to normal threshold'
        })
        .eq('agent_id', agent.id)
        .eq('resolved', false)
        .in('severity', ['low', 'medium', 'high']) // Exclui 'critical' - precisam de resolução humana
        .in('alert_type', alertsToResolve);

      if (resolveError) {
        logger.error('Failed to auto-resolve alerts', resolveError);
      } else if (resolvedCount && resolvedCount > 0) {
        logger.info(`Auto-resolved ${resolvedCount} non-critical alerts for ${agent.agent_name}`);
      }
    }

    // ── Bloco A: Trigger automation rules evaluation after metrics ingestion ──
    let automationTriggered = 0;
    try {
      const { data: activeRules } = await supabase
        .from('automation_rules')
        .select('id')
        .eq('tenant_id', agent.tenant_id)
        .eq('is_active', true)
        .eq('trigger_type', 'metric_threshold')
        .limit(1);

      if (activeRules && activeRules.length > 0) {
        const evalUrl = `${SUPABASE_URL}/functions/v1/evaluate-automation-rules`;
        const evalResponse = await fetch(evalUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ tenant_id: agent.tenant_id }),
        });

        if (evalResponse.ok) {
          const evalResult = await evalResponse.json();
          automationTriggered = evalResult.triggered || 0;
          if (automationTriggered > 0) {
            logger.info(`Automation: ${automationTriggered} rules triggered for ${agent.agent_name}`);
          }
        }
      }
    } catch (automationError) {
      logger.warn('Automation evaluation failed (non-blocking)', automationError);
    }

    // ── Light Mode Evaluation ──
    let lightModeConfig: any = null;
    try {
      // Get latest process snapshot for media process detection
      const { data: latestProcesses } = await supabase
        .from('agent_processes')
        .select('processes')
        .eq('agent_id', agent.id)
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestProcesses?.processes) {
        const processNames = (latestProcesses.processes as any[]).map((p: any) => p.name || '');
        const cpuPercent = metrics.cpu_usage_percent ?? 0;
        // Estimate network throughput from bytes (rough Mbps)
        const networkMbps = ((metrics.network_bytes_sent ?? 0) + (metrics.network_bytes_received ?? 0)) / (1024 * 1024);

        // Default media processes to detect
        const mediaProcesses = ['chrome', 'firefox', 'msedge', 'vlc', 'obs64', 'obs', 'teams', 'zoom', 'discord', 'spotify'];
        const normalizedActive = new Set(processNames.map(n => n.toLowerCase().replace('.exe', '')));
        const detectedMedia = mediaProcesses.filter(mp => normalizedActive.has(mp));

        // Get or create light mode config
        const { data: existingConfig } = await supabase
          .from('agent_light_mode_configs')
          .select('*')
          .eq('agent_id', agent.id)
          .maybeSingle();

        if (detectedMedia.length > 0 && cpuPercent > 50 && networkMbps > 10) {
          // Conditions met — activate light mode
          if (!existingConfig?.is_active) {
            const configData = {
              agent_id: agent.id,
              tenant_id: agent.tenant_id,
              is_active: true,
              activated_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
              reason: 'media_streaming_detected',
              collection_interval_seconds: 600,
              skip_process_collection: true,
              skip_network_collection: true,
              compress_payloads: true,
              active_media_processes: detectedMedia,
            };

            if (existingConfig) {
              await supabase.from('agent_light_mode_configs').update(configData).eq('id', existingConfig.id);
            } else {
              await supabase.from('agent_light_mode_configs').insert(configData);
            }

            lightModeConfig = { activated: true, media: detectedMedia, duration: 15 };
            logger.info(`[Light Mode] Activated for ${agent.agent_name}: ${detectedMedia.join(', ')}`);
          }
        } else if (existingConfig?.is_active) {
          // Check expiration
          if (existingConfig.expires_at && new Date() >= new Date(existingConfig.expires_at)) {
            await supabase.from('agent_light_mode_configs').update({
              is_active: false,
              activated_at: null,
              expires_at: null,
              reason: '',
              collection_interval_seconds: 60,
              skip_process_collection: false,
              skip_network_collection: false,
              compress_payloads: false,
              active_media_processes: [],
            }).eq('id', existingConfig.id);

            lightModeConfig = { deactivated: true, reason: 'expired' };
            logger.info(`[Light Mode] Deactivated for ${agent.agent_name}: expired`);
          }
        }
      }
    } catch (lightModeError) {
      logger.warn('[Light Mode] Evaluation failed (non-blocking)', lightModeError);
    }

    logger.success(`Metrics processed, ${alerts.length} alerts generated, ${automationTriggered} automations triggered`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        alerts_generated: alerts.length,
        automation_triggered: automationTriggered,
        light_mode: lightModeConfig,
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
