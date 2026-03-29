import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WeeklyMetrics {
  playbooks_executed: number;
  playbooks_auto_executed: number;
  playbooks_pending: number;
  vulnerabilities_detected: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  web_policies_enforced: number;
  blocked_attempts: number;
  approval_requests: {
    total: number;
    approved: number;
    rejected: number;
    expired: number;
  };
  agents: {
    total: number;
    active: number;
    offline: number;
    isolated: number;
  };
  security_events: {
    total: number;
    critical: number;
    high: number;
  };
  risk_score: {
    current: number;
    previous: number;
    trend: 'up' | 'down' | 'stable';
  };
}

serve(async (req) => {
  // Auth guard: reject unauthenticated calls
  const authError = await assertInternalCaller(req);
  if (authError) return authError;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all tenants (no is_active column exists, all tenants are active)
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name');

    if (tenantsError) throw tenantsError;

    const reports = [];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date();
    weekEnd.setHours(23, 59, 59, 999);

    for (const tenant of tenants || []) {
      logger.info(`[generate-weekly-report] Processing tenant: ${tenant.name}`);

      // Playbook Executions
      const { data: executions } = await supabase
        .from('playbook_executions')
        .select('id, status, auto_executed, dry_run')
        .eq('tenant_id', tenant.id)
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', weekEnd.toISOString());

      const playbooksExecuted = executions?.length || 0;
      const playbooksAutoExecuted = executions?.filter(e => e.auto_executed && !e.dry_run).length || 0;
      const playbooksPending = executions?.filter(e => e.status === 'pending').length || 0;

      // Vulnerabilities
      const { data: vulns } = await supabase
        .from('vuln_findings')
        .select('severity')
        .eq('tenant_id', tenant.id)
        .gte('created_at', weekStart.toISOString());

      const vulnStats = {
        critical: vulns?.filter(v => v.severity === 'critical').length || 0,
        high: vulns?.filter(v => v.severity === 'high').length || 0,
        medium: vulns?.filter(v => v.severity === 'medium').length || 0,
        low: vulns?.filter(v => v.severity === 'low').length || 0,
      };

      // Blocked Attempts
      const { count: blockedCount } = await supabase
        .from('blocked_access_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('created_at', weekStart.toISOString());

      // Web Activity Blocks
      const { count: webBlockedCount } = await supabase
        .from('agent_web_activity')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_blocked', true)
        .gte('visited_at', weekStart.toISOString());

      // Approval Requests
      const { data: approvals } = await supabase
        .from('approval_requests')
        .select('id, status')
        .eq('tenant_id', tenant.id)
        .gte('created_at', weekStart.toISOString());

      const approvalStats = {
        total: approvals?.length || 0,
        approved: approvals?.filter(a => a.status === 'approved').length || 0,
        rejected: approvals?.filter(a => a.status === 'rejected').length || 0,
        expired: approvals?.filter(a => a.status === 'expired').length || 0,
      };

      // Agents
      const fiveMinutesAgo = new Date(Date.now() - 30 * 60 * 1000); // 30min unified threshold
      const { data: agents } = await supabase
        .from('agents')
        .select('id, status, last_heartbeat, is_isolated')
        .eq('tenant_id', tenant.id);

      const agentStats = {
        total: agents?.length || 0,
        active: agents?.filter(a => 
          a.status === 'active' && 
          a.last_heartbeat && 
          new Date(a.last_heartbeat) > fiveMinutesAgo
        ).length || 0,
        offline: agents?.filter(a => 
          !a.last_heartbeat || new Date(a.last_heartbeat) <= fiveMinutesAgo
        ).length || 0,
        isolated: agents?.filter(a => a.is_isolated).length || 0,
      };

      // Security Events
      const { data: secEvents } = await supabase
        .from('security_logs')
        .select('severity')
        .eq('tenant_id', tenant.id)
        .gte('created_at', weekStart.toISOString());

      const secEventStats = {
        total: secEvents?.length || 0,
        critical: secEvents?.filter(e => e.severity === 'critical').length || 0,
        high: secEvents?.filter(e => e.severity === 'high').length || 0,
      };

      // Risk Score (current vs previous week)
      const { data: currentScore } = await supabase.rpc('get_tenant_risk_score', {
        p_tenant_id: tenant.id
      });

      // Build metrics
      const metrics: WeeklyMetrics = {
        playbooks_executed: playbooksExecuted,
        playbooks_auto_executed: playbooksAutoExecuted,
        playbooks_pending: playbooksPending,
        vulnerabilities_detected: vulnStats,
        web_policies_enforced: webBlockedCount || 0,
        blocked_attempts: blockedCount || 0,
        approval_requests: approvalStats,
        agents: agentStats,
        security_events: secEventStats,
        risk_score: {
          current: currentScore?.risk_score || 50,
          previous: currentScore?.previous_score || 50,
          trend: currentScore?.risk_score > currentScore?.previous_score ? 'up' : 
                 currentScore?.risk_score < currentScore?.previous_score ? 'down' : 'stable',
        },
      };

      // Generate executive summary
      const executiveSummary = generateExecutiveSummary(metrics, tenant.name);

      // Save report
      const { data: report, error: reportError } = await supabase
        .from('weekly_security_reports')
        .upsert({
          tenant_id: tenant.id,
          week_start: weekStart.toISOString().split('T')[0],
          week_end: weekEnd.toISOString().split('T')[0],
          metrics: metrics,
          executive_summary: executiveSummary,
          generated_at: new Date().toISOString(),
        }, {
          onConflict: 'tenant_id,week_start',
        })
        .select()
        .single();

      if (reportError) {
        logger.error(`[generate-weekly-report] Error saving report for ${tenant.name}:`, reportError);
        continue;
      }

      reports.push({ tenant: tenant.name, report_id: report?.id });

      // Send email notification
      try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
        
        await fetch(`${SUPABASE_URL}/functions/v1/notification-dispatcher`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': INTERNAL_SECRET || '',
          },
          body: JSON.stringify({
            channel: 'in_app',
            type: 'report',
            tenant_id: tenant.id,
            subject: `Relatorio Semanal de Seguranca - ${tenant.name}`,
            message: executiveSummary,
            severity: 'info',
            metadata: {
              week_start: weekStart.toISOString(),
              week_end: weekEnd.toISOString(),
              metrics_summary: {
                playbooks: metrics.playbooks_executed,
                vulns: metrics.vulnerabilities_detected.critical + metrics.vulnerabilities_detected.high,
                blocked: metrics.blocked_attempts,
                agents_protected: metrics.agents.active,
              },
            },
          }),
        });
        
        logger.info(`[generate-weekly-report] Email sent for ${tenant.name}`);
      } catch (emailError) {
        logger.error(`[generate-weekly-report] Email error for ${tenant.name}:`, emailError);
      }
    }

    const durationMs = Date.now() - startedAt;

    // Log successful job execution
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'generate-weekly-report',
        p_success: true,
        p_duration_ms: durationMs,
        p_result: {
          reports_generated: reports.length,
          tenants: reports.map(r => r.tenant),
        },
        p_processed_count: reports.length,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      logger.error('[generate-weekly-report] Failed to log job run:', logErr);
    }

    return new Response(JSON.stringify({
      success: true,
      reports_generated: reports.length,
      reports,
      period: {
        start: weekStart.toISOString(),
        end: weekEnd.toISOString(),
      },
      duration_ms: durationMs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error('[generate-weekly-report] Error:', error);

    // Log failed job execution
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'generate-weekly-report',
        p_success: false,
        p_duration_ms: durationMs,
        p_error: error instanceof Error ? error.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (logErr) {
      logger.error('[generate-weekly-report] Failed to log error:', logErr);
    }

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateExecutiveSummary(metrics: WeeklyMetrics, tenantName: string): string {
  const criticalVulns = metrics.vulnerabilities_detected.critical;
  const highVulns = metrics.vulnerabilities_detected.high;
  const protectionRate = metrics.agents.total > 0 
    ? Math.round((metrics.agents.active / metrics.agents.total) * 100) 
    : 0;

  let status = '? SEGURO';
  if (criticalVulns > 0 || metrics.security_events.critical > 5) {
    status = '? ATENCAO CRITICA';
  } else if (highVulns > 3 || metrics.agents.offline > 5) {
    status = '? REQUER ATENCAO';
  }

  return `
? RELATORIO SEMANAL DE SEGURANCA - ${tenantName}

${status}

? RESUMO EXECUTIVO:

? Playbooks Executados: ${metrics.playbooks_executed} (${metrics.playbooks_auto_executed} automaticos)
? Vulnerabilidades Criticas: ${criticalVulns} | Altas: ${highVulns}
? Tentativas Bloqueadas: ${metrics.blocked_attempts}
? Taxa de Protecao: ${protectionRate}% (${metrics.agents.active}/${metrics.agents.total} agentes)

? APROVACOES:
? Aprovadas: ${metrics.approval_requests.approved}
? Rejeitadas: ${metrics.approval_requests.rejected}
? Expiradas: ${metrics.approval_requests.expired}

? TENDENCIA DE RISCO:
? Score Atual: ${metrics.risk_score.current}
? Score Anterior: ${metrics.risk_score.previous}
? Tendencia: ${metrics.risk_score.trend === 'up' ? '?? Aumentou' : metrics.risk_score.trend === 'down' ? '?? Diminuiu' : '?? Estavel'}

---
Gerado automaticamente pelo CyberShield Security Platform
  `.trim();
}
