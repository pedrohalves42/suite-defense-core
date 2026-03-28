import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCallerTenant } from '../_shared/validate-caller-tenant.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FailurePattern {
  agent_id: string;
  agent_name: string;
  job_type: string;
  failure_count: number;
  total_count: number;
  failure_rate: number;
  common_errors: string[];
  last_failure: string;
}

interface TenantAnalysis {
  tenant_id: string;
  patterns: FailurePattern[];
  overall_failure_rate: number;
  recommendations: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tenant_id, hours_back = 24, threshold = 50 } = await req.json().catch(() => ({}));

    // V-1042 FIX: Validate caller has access to requested tenant (if specified)
    if (tenant_id) {
      const validation = await validateCallerTenant(req, supabase, tenant_id);
      if (!validation.authorized) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: validation.statusCode || 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    logger.info(`Analyzing job failure patterns for ${tenant_id || 'all tenants'}, last ${hours_back}h`);

    const cutoffTime = new Date(Date.now() - hours_back * 60 * 60 * 1000).toISOString();

    // Build query for jobs
    let jobsQuery = supabase
      .from('jobs')
      .select(`
        id,
        tenant_id,
        agent_id,
        job_type,
        status,
        error_message,
        created_at,
        completed_at,
        agents!inner(agent_name)
      `)
      .gte('created_at', cutoffTime)
      .in('status', ['completed', 'failed', 'error']);

    if (tenant_id) {
      jobsQuery = jobsQuery.eq('tenant_id', tenant_id);
    }

    const { data: jobs, error: jobsError } = await jobsQuery;

    if (jobsError) {
      logger.error('Error fetching jobs:', jobsError);
      throw jobsError;
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({
        message: 'No jobs found in the specified period',
        patterns: [],
        recommendations: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group jobs by tenant -> agent -> job_type
    const tenantGroups = new Map<string, Map<string, Map<string, typeof jobs>>>();

    for (const job of jobs) {
      if (!tenantGroups.has(job.tenant_id)) {
        tenantGroups.set(job.tenant_id, new Map());
      }
      const agentGroups = tenantGroups.get(job.tenant_id)!;
      
      const agentKey = job.agent_id || 'unknown';
      if (!agentGroups.has(agentKey)) {
        agentGroups.set(agentKey, new Map());
      }
      const typeGroups = agentGroups.get(agentKey)!;
      
      if (!typeGroups.has(job.job_type)) {
        typeGroups.set(job.job_type, []);
      }
      typeGroups.get(job.job_type)!.push(job);
    }

    // Analyze patterns
    const tenantAnalyses: TenantAnalysis[] = [];
    const insightsToCreate: Array<Record<string, unknown>> = [];
    const alertsToCreate: Array<Record<string, unknown>> = [];

    for (const [tenantId, agentGroups] of tenantGroups) {
      const patterns: FailurePattern[] = [];
      let tenantTotalJobs = 0;
      let tenantFailedJobs = 0;

      for (const [agentId, typeGroups] of agentGroups) {
        for (const [jobType, typeJobs] of typeGroups) {
          const totalCount = typeJobs.length;
          const failedJobs = typeJobs.filter(j => j.status === 'failed' || j.status === 'error');
          const failureCount = failedJobs.length;
          const failureRate = Math.round((failureCount / totalCount) * 100);

          tenantTotalJobs += totalCount;
          tenantFailedJobs += failureCount;

          // Only report patterns with significant failure rate
          if (failureRate >= threshold && totalCount >= 3) {
            // Extract common error messages
            const errorCounts = new Map<string, number>();
            for (const job of failedJobs) {
              const error = job.error_message?.substring(0, 100) || 'Unknown error';
              errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
            }
            const commonErrors = Array.from(errorCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([error]) => error);

            const lastFailure = failedJobs
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

            const agentName = (((typeJobs[0] as Record<string, unknown>).agents as Record<string, unknown> | undefined)?.agent_name as string) || 'Unknown';

            patterns.push({
              agent_id: agentId,
              agent_name: agentName,
              job_type: jobType,
              failure_count: failureCount,
              total_count: totalCount,
              failure_rate: failureRate,
              common_errors: commonErrors,
              last_failure: lastFailure?.created_at || ''
            });

            // Create AI insight for high failure rate
            if (failureRate >= 70) {
              insightsToCreate.push({
                tenant_id: tenantId,
                insight_type: 'job_failure_pattern',
                title: `Alta taxa de falha em ${jobType}`,
                description: `O agente ${agentName} está com ${failureRate}% de falha em jobs do tipo ${jobType}. Últimas ${hours_back}h: ${failureCount}/${totalCount} falharam.`,
                severity: failureRate >= 90 ? 'critical' : 'high',
                category: 'performance',
                affected_entity_type: 'agent',
                affected_entity_id: agentId,
                recommendation: generateRecommendation(jobType, commonErrors),
                metadata: {
                  job_type: jobType,
                  failure_rate: failureRate,
                  failure_count: failureCount,
                  total_count: totalCount,
                  common_errors: commonErrors,
                  agent_name: agentName
                },
                status: 'open',
                auto_generated: true
              });
            }
          }
        }
      }

      const overallFailureRate = tenantTotalJobs > 0 
        ? Math.round((tenantFailedJobs / tenantTotalJobs) * 100) 
        : 0;

      // Generate recommendations based on patterns
      const recommendations: string[] = [];
      
      if (overallFailureRate > 50) {
        recommendations.push('Taxa de falha geral está muito alta. Considere verificar conectividade dos agentes.');
      }

      const webActivityPatterns = patterns.filter(p => p.job_type.includes('web_activity'));
      if (webActivityPatterns.length > 0) {
        recommendations.push('Falhas em coleta de atividade web podem indicar problemas de permissão ou navegador não instalado.');
      }

      const softwarePatterns = patterns.filter(p => p.job_type.includes('software'));
      if (softwarePatterns.length > 0) {
        recommendations.push('Falhas em inventário de software podem indicar timeout. Considere aumentar o tempo limite.');
      }

      const vulnPatterns = patterns.filter(p => p.job_type.includes('vuln'));
      if (vulnPatterns.length > 0) {
        recommendations.push('Falhas em scan de vulnerabilidades podem indicar falta de conectividade com base NVD.');
      }

      // Create alert if overall failure rate is critical
      if (overallFailureRate >= 50 && tenantTotalJobs >= 10) {
        alertsToCreate.push({
          tenant_id: tenantId,
          alert_type: 'high_job_failure_rate',
          title: `Taxa de falha de jobs em ${overallFailureRate}%`,
          message: `Nos últimos ${hours_back}h, ${tenantFailedJobs} de ${tenantTotalJobs} jobs falharam. Verifique os agentes afetados.`,
          severity: overallFailureRate >= 70 ? 'critical' : 'high',
          status: 'active',
          metadata: {
            failure_rate: overallFailureRate,
            failed_count: tenantFailedJobs,
            total_count: tenantTotalJobs,
            patterns_count: patterns.length
          }
        });
      }

      tenantAnalyses.push({
        tenant_id: tenantId,
        patterns: patterns.sort((a, b) => b.failure_rate - a.failure_rate),
        overall_failure_rate: overallFailureRate,
        recommendations
      });
    }

    // Insert insights (avoid duplicates by checking recent ones)
    if (insightsToCreate.length > 0) {
      for (const insight of insightsToCreate) {
        // Check if similar insight exists in last 24h
        const { data: existing } = await supabase
          .from('ai_insights')
          .select('id')
          .eq('tenant_id', insight.tenant_id)
          .eq('insight_type', insight.insight_type)
          .eq('affected_entity_id', insight.affected_entity_id)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from('ai_insights').insert(insight);
          logger.info(`Created insight for ${insight.affected_entity_id}`);
        }
      }
    }

    // Insert alerts
    if (alertsToCreate.length > 0) {
      for (const alert of alertsToCreate) {
        // Check if similar alert exists
        const { data: existing } = await supabase
          .from('system_alerts')
          .select('id')
          .eq('tenant_id', alert.tenant_id)
          .eq('alert_type', alert.alert_type)
          .eq('status', 'active')
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from('system_alerts').insert(alert);
          logger.info(`Created alert for tenant ${alert.tenant_id}`);
        }
      }
    }

    logger.info(`Analysis complete: ${tenantAnalyses.length} tenants, ${insightsToCreate.length} insights, ${alertsToCreate.length} alerts`);

    return new Response(JSON.stringify({
      analyses: tenantAnalyses,
      insights_created: insightsToCreate.length,
      alerts_created: alertsToCreate.length,
      period_hours: hours_back,
      threshold_percent: threshold
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error('Error analyzing job failure patterns:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateRecommendation(jobType: string, commonErrors: string[]): string {
  const recommendations: Record<string, string> = {
    'collect_web_activity': 'Verifique se o navegador está instalado e se o agente tem permissão para acessar o histórico.',
    'software_inventory_collect': 'Aumente o timeout do job ou verifique se há muitos programas instalados causando lentidão.',
    'light_vuln_scan': 'Verifique conectividade com internet e se o firewall permite acesso às APIs de CVE.',
    'antivirus_status': 'Verifique se o antivírus está instalado e acessível pelo agente.',
    'system_metrics': 'Verifique permissões do agente para acessar métricas do sistema.',
  };

  let rec = recommendations[jobType] || 'Verifique os logs do agente para mais detalhes sobre as falhas.';

  // Add error-specific recommendations
  if (commonErrors.some(e => e.toLowerCase().includes('timeout'))) {
    rec += ' Considere aumentar o timeout ou verificar a carga do sistema.';
  }
  if (commonErrors.some(e => e.toLowerCase().includes('permission') || e.toLowerCase().includes('access'))) {
    rec += ' Verifique as permissões do agente no sistema operacional.';
  }
  if (commonErrors.some(e => e.toLowerCase().includes('network') || e.toLowerCase().includes('connection'))) {
    rec += ' Verifique a conectividade de rede do computador.';
  }

  return rec;
}
