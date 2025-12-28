/**
 * check-agent-integrity Edge Function
 * 
 * Verifica periodicamente se agentes ativos ainda estão respondendo corretamente.
 * Detecta agentes que foram removidos após reinício ou por antivírus.
 * 
 * Casos detectados:
 * 1. Agente estava online e parou de responder após reinício
 * 2. Agente com heartbeat antigo (>30 min) após ter estado ativo
 * 3. Agentes que nunca enviaram heartbeat após instalação
 * 
 * Este job deve ser executado via cron a cada 15 minutos.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { shouldProcessAlertsForTenant } from '../_shared/business-hours.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface IntegrityCheckResult {
  agent_id: string;
  agent_name: string;
  tenant_id: string;
  issue_type: 'removed_after_reboot' | 'stale_after_active' | 'never_connected';
  last_heartbeat: string | null;
  enrolled_at: string;
  minutes_since_heartbeat: number | null;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[${requestId}] Starting agent integrity check`);

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

    console.log(`[${requestId}] Found ${problematicAgents?.length || 0} agents with potential integrity issues`);

    const issues: IntegrityCheckResult[] = [];
    const alertsToCreate: any[] = [];
    const skippedDueToBusinessHours: string[] = [];

    // Cache de verificação de horário por tenant
    const tenantBusinessHoursCache: Record<string, { shouldProcess: boolean; reason: string }> = {};

    for (const agent of problematicAgents || []) {
      // Verificar horário de expediente do tenant
      if (!tenantBusinessHoursCache[agent.tenant_id]) {
        tenantBusinessHoursCache[agent.tenant_id] = await shouldProcessAlertsForTenant(supabase, agent.tenant_id);
      }
      
      const { shouldProcess, reason } = tenantBusinessHoursCache[agent.tenant_id];
      
      if (!shouldProcess) {
        skippedDueToBusinessHours.push(agent.agent_name);
        console.log(`[${requestId}] Skipping integrity check for ${agent.agent_name} - ${reason}`);
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

      issues.push({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        tenant_id: agent.tenant_id,
        issue_type: issueType,
        last_heartbeat: agent.last_heartbeat,
        enrolled_at: agent.enrolled_at,
        minutes_since_heartbeat: minutesSinceHeartbeat,
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

    // Inserir alertas (evitar duplicados verificando existentes)
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
            console.warn(`[${requestId}] Error creating alert for ${alert.agent_id}:`, alertError.message);
          }
        }
      }
      console.log(`[${requestId}] Processed ${alertsToCreate.length} integrity alerts`);
    }

    // Atualizar status dos agentes com problemas graves para 'inactive'
    // (apenas se dentro do horário de expediente)
    const agentsToDeactivate = issues
      .filter(i => i.minutes_since_heartbeat && i.minutes_since_heartbeat > 60)
      .map(i => i.agent_id);

    if (agentsToDeactivate.length > 0) {
      const { error: updateError } = await supabase
        .from('agents')
        .update({ status: 'inactive' })
        .in('id', agentsToDeactivate);

      if (updateError) {
        console.warn(`[${requestId}] Error updating agent status:`, updateError.message);
      } else {
        console.log(`[${requestId}] Marked ${agentsToDeactivate.length} agents as inactive`);
      }
    }

    // Log de eventos para auditoria
    for (const issue of issues.filter(i => i.issue_type === 'removed_after_reboot')) {
      await supabase.from('agent_events').insert({
        agent_id: issue.agent_id,
        tenant_id: issue.tenant_id,
        event_type: 'integrity_check_failed',
        details: {
          issue_type: issue.issue_type,
          last_heartbeat: issue.last_heartbeat,
          minutes_since_heartbeat: issue.minutes_since_heartbeat,
          detected_at: new Date().toISOString(),
          recommendation: 'Reinstall agent after adding Windows Defender exclusion'
        }
      });
    }

    if (skippedDueToBusinessHours.length > 0) {
      console.log(`[${requestId}] Skipped ${skippedDueToBusinessHours.length} agents due to business hours`);
    }

    const summary = {
      total_checked: problematicAgents?.length || 0,
      skipped_outside_business_hours: skippedDueToBusinessHours.length,
      removed_after_reboot: issues.filter(i => i.issue_type === 'removed_after_reboot').length,
      stale_after_active: issues.filter(i => i.issue_type === 'stale_after_active').length,
      never_connected: issues.filter(i => i.issue_type === 'never_connected').length,
      alerts_created: alertsToCreate.length,
      agents_deactivated: agentsToDeactivate.length,
    };

    console.log(`[${requestId}] Integrity check completed:`, summary);

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        timestamp: new Date().toISOString(),
        summary,
        issues: issues.slice(0, 50), // Limitar resposta
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Error in integrity check:`, error);
    
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
