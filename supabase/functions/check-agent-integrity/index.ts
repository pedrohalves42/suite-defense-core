/**
 * check-agent-integrity Edge Function
 * 
 * Verifica periodicamente se agentes ativos ainda estão respondendo corretamente.
 * Detecta agentes que foram removidos após reinício ou por antivírus.
 * 
 * MELHORIAS FASE 4:
 * - Alertas imediatos para falhas persistentes (bypass throttling)
 * - Tracking de contagem de falhas por agente
 * - Integração com tabela persistent_failure_alerts
 * 
 * Este job deve ser executado via cron a cada 15 minutos.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { shouldProcessAlertsForTenant } from '../_shared/business-hours.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Thresholds para alertas
const PERSISTENT_FAILURE_THRESHOLD = 3; // Número de falhas para considerar persistente
const IMMEDIATE_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos entre alertas imediatos

interface IntegrityCheckResult {
  agent_id: string;
  agent_name: string;
  tenant_id: string;
  issue_type: 'removed_after_reboot' | 'stale_after_active' | 'never_connected' | 'persistent_failure';
  last_heartbeat: string | null;
  enrolled_at: string;
  minutes_since_heartbeat: number | null;
  failure_count?: number;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[${requestId}] Starting agent integrity check with immediate alerts`);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar agentes com problemas de integridade
    const { data: problematicAgents, error: queryError } = await supabase
      .from('agents')
      .select(`
        id,
        agent_name,
        tenant_id,
        status,
        last_heartbeat,
        enrolled_at,
        hostname,
        os_type
      `)
      .eq('status', 'active')
      .or(`last_heartbeat.is.null,last_heartbeat.lt.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`);

    if (queryError) {
      throw new Error(`Failed to query agents: ${queryError.message}`);
    }

    logger.info(`[${requestId}] Found ${problematicAgents?.length || 0} agents with potential integrity issues`);

    const issues: IntegrityCheckResult[] = [];
    const alertsToCreate: Array<Record<string, unknown>> = [];
    const immediateAlertsToSend: Array<Record<string, unknown>> = [];
    const skippedDueToBusinessHours: string[] = [];

    // Cache de verificação de horário por tenant
    const tenantBusinessHoursCache: Record<string, { shouldProcess: boolean; reason: string }> = {};

    // 2. Buscar alertas persistentes existentes para atualizar contagem
    const { data: existingPersistentAlerts } = await supabase
      .from('persistent_failure_alerts')
      .select('id, agent_id, failure_count, last_alert_sent_at')
      .eq('is_acknowledged', false);

    const persistentAlertsMap = new Map(
      (existingPersistentAlerts || []).map(a => [a.agent_id, a])
    );

    for (const agent of problematicAgents || []) {
      // Verificar horário de expediente do tenant
      if (!tenantBusinessHoursCache[agent.tenant_id]) {
        tenantBusinessHoursCache[agent.tenant_id] = await shouldProcessAlertsForTenant(supabase, agent.tenant_id);
      }
      
      const { shouldProcess, reason } = tenantBusinessHoursCache[agent.tenant_id];
      
      if (!shouldProcess) {
        skippedDueToBusinessHours.push(agent.agent_name);
        logger.info(`[${requestId}] Skipping integrity check for ${agent.agent_name} - ${reason}`);
        continue;
      }

      let issueType: IntegrityCheckResult['issue_type'];
      let minutesSinceHeartbeat: number | null = null;

      if (!agent.last_heartbeat) {
        // Agente nunca enviou heartbeat
        issueType = 'never_connected';
      } else {
        minutesSinceHeartbeat = Math.floor(
          (Date.now() - new Date(agent.last_heartbeat).getTime()) / (1000 * 60)
        );

        // Se o último heartbeat foi há mais de 30 minutos mas menos de 24 horas
        // provavelmente foi removido após reboot
        if (minutesSinceHeartbeat > 30 && minutesSinceHeartbeat < 1440) {
          issueType = 'removed_after_reboot';
        } else {
          issueType = 'stale_after_active';
        }
      }

      // 3. Verificar/atualizar alerta persistente
      const existingAlert = persistentAlertsMap.get(agent.id);
      let failureCount = 1;

      if (existingAlert) {
        failureCount = (existingAlert.failure_count || 0) + 1;
        
        // Atualizar contagem de falhas
        await supabase
          .from('persistent_failure_alerts')
          .update({
            failure_count: failureCount,
            last_failure_at: new Date().toISOString(),
          })
          .eq('id', existingAlert.id);

        // Verificar se deve enviar alerta imediato
        const lastAlertSent = existingAlert.last_alert_sent_at 
          ? new Date(existingAlert.last_alert_sent_at).getTime() 
          : 0;
        
        const shouldSendImmediate = 
          failureCount >= PERSISTENT_FAILURE_THRESHOLD &&
          (Date.now() - lastAlertSent) > IMMEDIATE_ALERT_COOLDOWN_MS;

        if (shouldSendImmediate) {
          issueType = 'persistent_failure';
          immediateAlertsToSend.push({
            alertId: existingAlert.id,
            agent,
            failureCount,
            minutesSinceHeartbeat,
          });
        }
      } else if (issueType === 'removed_after_reboot') {
        // Criar novo alerta persistente
        await supabase
          .from('persistent_failure_alerts')
          .insert({
            tenant_id: agent.tenant_id,
            agent_id: agent.id,
            alert_type: 'agent_integrity_failure',
            failure_count: 1,
            first_failure_at: new Date().toISOString(),
            last_failure_at: new Date().toISOString(),
            metadata: {
              hostname: agent.hostname,
              os_type: agent.os_type,
              issue_type: issueType,
            },
          });
      }

      issues.push({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        tenant_id: agent.tenant_id,
        issue_type: issueType,
        last_heartbeat: agent.last_heartbeat,
        enrolled_at: agent.enrolled_at,
        minutes_since_heartbeat: minutesSinceHeartbeat,
        failure_count: failureCount,
      });

      // Criar alerta apenas para casos de remoção após reboot (mais crítico)
      if (issueType === 'removed_after_reboot') {
        alertsToCreate.push({
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          alert_type: 'agent_integrity_failure',
          severity: 'high',
          message: `Computador "${agent.agent_name}" parou de responder após possível reinício. ` +
                   `Último sinal há ${minutesSinceHeartbeat} minutos. ` +
                   `Possível remoção por antivírus ou falha na Scheduled Task.`,
          resolved: false,
          metadata: {
            issue_type: issueType,
            hostname: agent.hostname,
            os_type: agent.os_type,
            last_heartbeat: agent.last_heartbeat,
            minutes_since_heartbeat: minutesSinceHeartbeat,
            recommendation: 'Verificar Windows Defender e reinstalar agente'
          }
        });
      }
    }

    // 4. Enviar alertas imediatos para falhas persistentes
    for (const immediateAlert of immediateAlertsToSend) {
      try {
        // Enviar via security-alert-dispatcher com flag immediate
        await supabase.functions.invoke('security-alert-dispatcher', {
          body: {
            type: 'agent_persistent_failure',
            severity: 'critical',
            immediate: true, // Flag para bypass de throttling
            tenant_id: immediateAlert.agent.tenant_id,
            agent_id: immediateAlert.agent.id,
            agent_name: immediateAlert.agent.agent_name,
            failure_count: immediateAlert.failureCount,
            minutes_since_heartbeat: immediateAlert.minutesSinceHeartbeat,
            message: `CRÍTICO: Agente "${immediateAlert.agent.agent_name}" com ${immediateAlert.failureCount} falhas consecutivas. Último heartbeat há ${immediateAlert.minutesSinceHeartbeat} minutos.`,
          }
        });

        // Atualizar timestamp do último alerta enviado
        await supabase
          .from('persistent_failure_alerts')
          .update({ last_alert_sent_at: new Date().toISOString() })
          .eq('id', immediateAlert.alertId);

        logger.info(`[${requestId}] Sent immediate alert for ${immediateAlert.agent.agent_name}`);
      } catch (alertError) {
        logger.warn(`[${requestId}] Failed to send immediate alert:`, alertError);
      }
    }

    // 5. Inserir alertas normais (evitar duplicados verificando existentes)
    if (alertsToCreate.length > 0) {
      for (const alert of alertsToCreate) {
        // Verificar se já existe alerta não resolvido para este agente
        const { data: existingAlert } = await supabase
          .from('system_alerts')
          .select('id')
          .eq('agent_id', alert.agent_id)
          .eq('alert_type', alert.alert_type)
          .eq('resolved', false)
          .maybeSingle();

        if (!existingAlert) {
          const { error: alertError } = await supabase
            .from('system_alerts')
            .insert(alert);

          if (alertError) {
            logger.warn(`[${requestId}] Error creating alert for ${alert.agent_id}:`, alertError.message);
          }
        }
      }
      logger.info(`[${requestId}] Processed ${alertsToCreate.length} integrity alerts`);
    }

    // 6. Atualizar status dos agentes com problemas graves para 'inactive'
    const agentsToDeactivate = issues
      .filter(i => i.minutes_since_heartbeat && i.minutes_since_heartbeat > 60)
      .map(i => i.agent_id);

    if (agentsToDeactivate.length > 0) {
      const { error: updateError } = await supabase
        .from('agents')
        .update({ status: 'inactive' })
        .in('id', agentsToDeactivate);

      if (updateError) {
        logger.warn(`[${requestId}] Error updating agent status:`, updateError.message);
      } else {
        logger.info(`[${requestId}] Marked ${agentsToDeactivate.length} agents as inactive`);
      }
    }

    // 7. Log de eventos para auditoria
    for (const issue of issues.filter(i => i.issue_type === 'removed_after_reboot' || i.issue_type === 'persistent_failure')) {
      await supabase.from('agent_events').insert({
        agent_id: issue.agent_id,
        tenant_id: issue.tenant_id,
        event_type: issue.issue_type === 'persistent_failure' ? 'persistent_failure_detected' : 'integrity_check_failed',
        details: {
          issue_type: issue.issue_type,
          last_heartbeat: issue.last_heartbeat,
          minutes_since_heartbeat: issue.minutes_since_heartbeat,
          failure_count: issue.failure_count,
          detected_at: new Date().toISOString(),
          recommendation: 'Reinstall agent after adding Windows Defender exclusion'
        }
      });
    }

    if (skippedDueToBusinessHours.length > 0) {
      logger.info(`[${requestId}] Skipped ${skippedDueToBusinessHours.length} agents due to business hours`);
    }

    const summary = {
      total_checked: problematicAgents?.length || 0,
      skipped_outside_business_hours: skippedDueToBusinessHours.length,
      removed_after_reboot: issues.filter(i => i.issue_type === 'removed_after_reboot').length,
      stale_after_active: issues.filter(i => i.issue_type === 'stale_after_active').length,
      never_connected: issues.filter(i => i.issue_type === 'never_connected').length,
      persistent_failures: issues.filter(i => i.issue_type === 'persistent_failure').length,
      alerts_created: alertsToCreate.length,
      immediate_alerts_sent: immediateAlertsToSend.length,
      agents_deactivated: agentsToDeactivate.length,
    };

    const durationMs = Date.now() - startedAt;

    // Log successful job execution
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-agent-integrity',
        p_success: true,
        p_duration_ms: durationMs,
        p_result: summary,
        p_processed_count: problematicAgents?.length || 0,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      logger.warn(`[${requestId}] Failed to log job run:`, logErr);
    }

    logger.info(`[${requestId}] Integrity check completed in ${durationMs}ms:`, summary);

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        timestamp: new Date().toISOString(),
        summary,
        issues: issues.slice(0, 50),
        duration_ms: durationMs,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error(`[${requestId}] Error in integrity check:`, error);

    // Log failed job execution
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-agent-integrity',
        p_success: false,
        p_duration_ms: durationMs,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      logger.warn(`[${requestId}] Failed to log error:`, logErr);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
