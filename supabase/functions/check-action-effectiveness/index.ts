import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EffectivenessResult = {
  status: 'resolved' | 'partial' | 'failed' | 'unknown';
  evidence: Record<string, unknown>;
  reason: string;
};

// Verification strategies by insight type
async function checkDnsActivity(
  supabase: any,
  agentId: string,
  actionCreatedAt: string,
  originalEvidence: Record<string, unknown>
): Promise<EffectivenessResult> {
  const domain = originalEvidence?.domain || originalEvidence?.blocked_domain;
  
  if (!domain) {
    return { status: 'unknown', evidence: {}, reason: 'No domain in original evidence' };
  }

  const { data: recentActivity, error } = await supabase
    .from('agent_web_activity')
    .select('id, domain, visited_at, is_blocked')
    .eq('agent_id', agentId)
    .eq('domain', domain)
    .gt('visited_at', actionCreatedAt)
    .limit(10);

  if (error) {
    logger.error('Error checking DNS activity:', error);
    return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' };
  }

  const activities = recentActivity as Array<{ id: string; domain: string; visited_at: string; is_blocked: boolean }> || [];
  const attempts = activities.length;
  const blockedAttempts = activities.filter(a => a.is_blocked).length;

  if (attempts === 0) {
    return {
      status: 'resolved',
      evidence: { domain, attempts_after_action: 0 },
      reason: `Nenhuma tentativa de acesso ao dominio ${domain} apos o bloqueio`
    };
  } else if (blockedAttempts === attempts) {
    return {
      status: 'resolved',
      evidence: { domain, attempts_after_action: attempts, all_blocked: true },
      reason: `${attempts} tentativa(s) bloqueada(s) com sucesso`
    };
  } else {
    return {
      status: 'partial',
      evidence: { domain, attempts_after_action: attempts, blocked: blockedAttempts },
      reason: `${attempts - blockedAttempts} tentativa(s) nao bloqueada(s)`
    };
  }
}

async function checkAntivirusStatus(
  supabase: any,
  agentId: string,
  actionCreatedAt: string,
  checkType: 'enabled' | 'updated'
): Promise<EffectivenessResult> {
  const { data, error } = await supabase
    .from('antivirus_status')
    .select('status, last_update_at, product_name, collected_at')
    .eq('agent_id', agentId)
    .order('collected_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return { status: 'unknown', evidence: { error: error?.message }, reason: 'No antivirus status found' };
  }

  const status = data as { status: string; last_update_at: string; product_name: string; collected_at: string };

  if (checkType === 'enabled') {
    if (status.status === 'enabled' || status.status === 'active') {
      return {
        status: 'resolved',
        evidence: { product: status.product_name, current_status: status.status },
        reason: `Antivirus ${status.product_name} esta ativo`
      };
    } else {
      return {
        status: 'failed',
        evidence: { product: status.product_name, current_status: status.status },
        reason: `Antivirus ainda esta ${status.status}`
      };
    }
  } else {
    const updateTime = new Date(status.last_update_at);
    const actionTime = new Date(actionCreatedAt);
    
    if (updateTime > actionTime) {
      return {
        status: 'resolved',
        evidence: { product: status.product_name, last_update: status.last_update_at },
        reason: `Antivirus atualizado em ${status.last_update_at}`
      };
    } else {
      return {
        status: 'failed',
        evidence: { product: status.product_name, last_update: status.last_update_at },
        reason: 'Antivirus ainda nao foi atualizado'
      };
    }
  }
}

async function checkSafeModeResolved(
  supabase: any,
  agentId: string
): Promise<EffectivenessResult> {
  const { data, error } = await supabase
    .from('agent_safe_mode_events')
    .select('id, entered_at, resolved_at, reason')
    .eq('agent_id', agentId)
    .order('entered_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' };
  }

  const event = data as { id: string; entered_at: string; resolved_at: string | null; reason: string } | null;

  if (event?.resolved_at) {
    return {
      status: 'resolved',
      evidence: { resolved_at: event.resolved_at },
      reason: `Safe mode resolvido em ${event.resolved_at}`
    };
  } else {
    return {
      status: 'failed',
      evidence: { entered_at: event?.entered_at, reason: event?.reason },
      reason: 'Agente ainda em safe mode'
    };
  }
}

async function checkAgentOnline(
  supabase: any,
  agentId: string
): Promise<EffectivenessResult> {
  const { data, error } = await supabase
    .from('agents')
    .select('status, agent_state, last_heartbeat')
    .eq('id', agentId)
    .single();

  if (error || !data) {
    return { status: 'unknown', evidence: { error: error?.message }, reason: 'Agent not found' };
  }

  const agent = data as { status: string; agent_state: string; last_heartbeat: string };
  const lastHeartbeat = new Date(agent.last_heartbeat);
  const fiveMinutesAgo = new Date(Date.now() - 30 * 60 * 1000); // 30min unified threshold

  if (agent.agent_state === 'online' && lastHeartbeat > fiveMinutesAgo) {
    return {
      status: 'resolved',
      evidence: { status: agent.status, state: agent.agent_state, last_heartbeat: agent.last_heartbeat },
      reason: 'Agente voltou a ficar online'
    };
  } else {
    return {
      status: 'failed',
      evidence: { status: agent.status, state: agent.agent_state, last_heartbeat: agent.last_heartbeat },
      reason: `Agente ainda esta ${agent.agent_state}`
    };
  }
}

async function checkVulnerabilityFixed(
  supabase: any,
  agentId: string,
  originalEvidence: Record<string, unknown>
): Promise<EffectivenessResult> {
  const cveId = originalEvidence?.cve_id || originalEvidence?.vulnerability_id;
  
  if (!cveId) {
    return { status: 'unknown', evidence: {}, reason: 'No CVE ID in original evidence' };
  }

  const { data: findings, error } = await supabase
    .from('vuln_findings')
    .select('id, cve_id, status')
    .eq('agent_id', agentId)
    .eq('cve_id', cveId)
    .eq('status', 'open')
    .limit(1);

  if (error) {
    return { status: 'unknown', evidence: { error: error.message }, reason: 'Query failed' };
  }

  const vulns = findings as Array<{ id: string; cve_id: string; status: string }> || [];

  if (vulns.length === 0) {
    return {
      status: 'resolved',
      evidence: { cve_id: cveId },
      reason: `Vulnerabilidade ${cveId} nao esta mais presente`
    };
  } else {
    return {
      status: 'failed',
      evidence: { cve_id: cveId, finding_id: vulns[0].id },
      reason: `Vulnerabilidade ${cveId} ainda presente`
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1135: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    logger.info('[check-action-effectiveness] Starting verification run');

    // Get actions pending verification (executed > 10 minutes ago)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    const { data: actions, error: fetchError } = await supabase
      .from('ai_actions')
      .select(`
        id,
        insight_id,
        action_type,
        executed_at,
        result,
        ai_insights!inner (
          id,
          insight_type,
          agent_id,
          evidence,
          tenant_id
        )
      `)
      .eq('effectiveness_status', 'pending')
      .eq('status', 'executed')
      .lt('executed_at', tenMinutesAgo)
      .limit(20);

    if (fetchError) {
      logger.error('[check-action-effectiveness] Error fetching actions:', fetchError);
      throw fetchError;
    }

    logger.info(`[check-action-effectiveness] Found ${actions?.length || 0} actions to verify`);

    const results: Array<{ actionId: string; status: string; reason: string }> = [];

    for (const action of actions ?? []) {
      // Handle the nested insight data - it can be an array or object
      const insightData = action.ai_insights;
      const insight = Array.isArray(insightData) ? insightData[0] : insightData;
      
      if (!insight) continue;

      const insight_type = insight.insight_type as string;
      const agent_id = insight.agent_id as string;
      const evidence = insight.evidence as Record<string, unknown>;
      const originalEvidence = evidence || {};

      let result: EffectivenessResult;

      logger.info(`[check-action-effectiveness] Checking ${insight_type} for agent ${agent_id}`);

      switch (insight_type) {
        case 'dns_malicious_activity':
        case 'dns_c2_communication':
          result = await checkDnsActivity(supabase, agent_id, action.executed_at, originalEvidence);
          break;

        case 'antivirus_disabled':
          result = await checkAntivirusStatus(supabase, agent_id, action.executed_at, 'enabled');
          break;

        case 'antivirus_outdated':
          result = await checkAntivirusStatus(supabase, agent_id, action.executed_at, 'updated');
          break;

        case 'safe_mode_prolonged':
          result = await checkSafeModeResolved(supabase, agent_id);
          break;

        case 'agent_offline_suspicious':
        case 'agent_offline_critical':
          result = await checkAgentOnline(supabase, agent_id);
          break;

        case 'vulnerability_critical':
        case 'vulnerability_high':
          result = await checkVulnerabilityFixed(supabase, agent_id, originalEvidence);
          break;

        default:
          // For types without specific verification, mark as unknown
          result = { 
            status: 'unknown', 
            evidence: { note: 'No specific verification strategy for this insight type' },
            reason: `Verificacao automatica nao disponivel para ${insight_type}`
          };
      }

      // Update ai_actions with result
      const { error: updateActionError } = await supabase
        .from('ai_actions')
        .update({
          effectiveness_status: result.status,
          effectiveness_checked_at: new Date().toISOString(),
          effectiveness_evidence: result.evidence
        })
        .eq('id', action.id);

      if (updateActionError) {
        logger.error(`[check-action-effectiveness] Error updating action ${action.id}:`, updateActionError);
      }

      // Update ai_insights.final_outcome
      const finalOutcome = result.status === 'unknown' ? null : result.status;
      if (finalOutcome) {
        const { error: updateInsightError } = await supabase
          .from('ai_insights')
          .update({ final_outcome: finalOutcome })
          .eq('id', insight.id);

        if (updateInsightError) {
          logger.error(`[check-action-effectiveness] Error updating insight ${insight.id}:`, updateInsightError);
        }
      }

      results.push({
        actionId: action.id,
        status: result.status,
        reason: result.reason
      });

      logger.info(`[check-action-effectiveness] Action ${action.id}: ${result.status} - ${result.reason}`);
    }

    // Log job execution with standardized RPC
    const durationMs = Date.now() - startedAt;
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'check-action-effectiveness',
      p_success: true,
      p_duration_ms: durationMs,
      p_result: {
        actions_checked: results.length,
        resolved: results.filter(r => r.status === 'resolved').length,
        failed: results.filter(r => r.status === 'failed').length,
        partial: results.filter(r => r.status === 'partial').length,
        unknown: results.filter(r => r.status === 'unknown').length,
      },
      p_processed_count: results.length,
      p_job_source: 'cron'
    });

    logger.info(`[check-action-effectiveness] Completed. Checked ${results.length} actions in ${durationMs}ms`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        checked: results.length,
        results,
        duration_ms: durationMs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error('[check-action-effectiveness] Error:', error);

    // Log failure
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-action-effectiveness',
        p_success: false,
        p_duration_ms: durationMs,
        p_error: (error as Error).message,
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (logError) {
      logger.error('[check-action-effectiveness] Failed to log error:', logError);
    }

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
