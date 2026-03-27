import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PlanFrequency {
  [key: string]: number | null;
}

const PLAN_FREQUENCIES: PlanFrequency = {
  free: null,
  starter: 30,
  basico: 30,
  completo: 30,
  avancado: 30,
  pro: 14,
  business: 14,
  scale: 7,
  enterprise: 7,
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1121: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    logger.info("Starting scheduled report generation...");

    logger.info("Starting scheduled report generation...");

    // Get all active tenants with their subscription plans
    const { data: tenants, error: tenantsError } = await supabase
      .from("tenant_subscriptions")
      .select(`
        tenant_id,
        status,
        plan_id,
        trial_end,
        subscription_plans!inner (
          name
        )
      `)
      .in("status", ["active", "trialing"]);

    if (tenantsError) {
      logger.error("Error fetching tenants:", tenantsError);
      throw tenantsError;
    }

    if (!tenants || tenants.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No active tenants found",
        generated: 0
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logger.info(`Found ${tenants.length} active tenants`);

    let generatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const tenant of tenants) {
      try {
        const planName = (tenant.subscription_plans as any)?.name || "free";
        const frequencyDays = PLAN_FREQUENCIES[planName] || PLAN_FREQUENCIES.starter;

        // For trial (free) plans, check if it's within 48h of first agent installation
        if (planName === "free" || tenant.status === "trialing") {
          const { data: firstAgent } = await supabase
            .from("agents")
            .select("enrolled_at")
            .eq("tenant_id", tenant.tenant_id)
            .order("enrolled_at", { ascending: true })
            .limit(1)
            .single();

          if (firstAgent) {
            const enrolledAt = new Date(firstAgent.enrolled_at);
            const hoursSinceEnroll = (Date.now() - enrolledAt.getTime()) / (1000 * 60 * 60);

            // Check if already generated trial report
            const { data: existingTrialReport } = await supabase
              .from("generated_reports")
              .select("id")
              .eq("tenant_id", tenant.tenant_id)
              .eq("triggered_by", "scheduled")
              .limit(1)
              .single();

            // Generate trial report if 48h+ passed and no existing scheduled report
            if (hoursSinceEnroll >= 48 && !existingTrialReport) {
              await generateTenantReport(supabase, tenant.tenant_id, "trial_48h");
              generatedCount++;
              continue;
            }
          }
          skippedCount++;
          continue;
        }

        // For paid plans, check last report date
        if (frequencyDays) {
          const { data: lastReport } = await supabase
            .from("generated_reports")
            .select("created_at")
            .eq("tenant_id", tenant.tenant_id)
            .eq("triggered_by", "scheduled")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          const lastReportDate = lastReport ? new Date(lastReport.created_at) : null;
          const daysSinceLastReport = lastReportDate 
            ? (Date.now() - lastReportDate.getTime()) / (1000 * 60 * 60 * 24)
            : frequencyDays + 1; // Force generation if no previous report

          if (daysSinceLastReport >= frequencyDays) {
            await generateTenantReport(supabase, tenant.tenant_id, "scheduled_periodic");
            generatedCount++;
          } else {
            skippedCount++;
          }
        }

      } catch (tenantError: any) {
        logger.error(`Error processing tenant ${tenant.tenant_id}:`, tenantError);
        errors.push(`${tenant.tenant_id}: ${tenantError.message}`);
      }
    }

    logger.info(`Scheduled report generation complete: generated=${generatedCount}, skipped=${skippedCount}`);

    const result = {
      success: true,
      processed: tenants.length,
      generated: generatedCount,
      skipped: skippedCount,
      errors: errors.length > 0 ? errors : undefined
    };

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'scheduled-report-generator',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: result,
      p_processed_count: generatedCount,
      p_job_source: 'cron'
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    logger.error("Error in scheduled-report-generator:", error);
    
    // Log error observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'scheduled-report-generator',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: error.message,
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (e) { logger.warn('[scheduled-report-generator] Failed to log job run:', e); }
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generateTenantReport(
  supabase: any, 
  tenantId: string, 
  triggerType: string
): Promise<void> {
  logger.info(`Generating ${triggerType} report for tenant ${tenantId}`);

  // Get all active agents for this tenant
  const { data: agents } = await supabase
    .from("agents")
    .select("id, agent_name")
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  if (!agents || agents.length === 0) {
    logger.info(`No active agents for tenant ${tenantId}, skipping report`);
    return;
  }

  // Gather consolidated statistics
  const { data: softwareStats } = await supabase
    .from("software_inventory")
    .select("id")
    .eq("tenant_id", tenantId);

  const { data: vulnStats } = await supabase
    .from("vuln_findings")
    .select("severity")
    .eq("tenant_id", tenantId);

  const { data: avStats } = await supabase
    .from("antivirus_status")
    .select("threats_found")
    .eq("tenant_id", tenantId);

  const { data: webStats } = await supabase
    .from("agent_web_activity")
    .select("is_blocked")
    .eq("tenant_id", tenantId);

  // Calculate statistics
  const criticalVulns = vulnStats?.filter((v: any) => v.severity === "critical").length || 0;
  const highVulns = vulnStats?.filter((v: any) => v.severity === "high").length || 0;
  const totalThreats = avStats?.reduce((sum: number, a: any) => sum + (a.threats_found || 0), 0) || 0;
  const blockedSites = webStats?.filter((w: any) => w.is_blocked).length || 0;

  const statistics = {
    total_agents: agents.length,
    total_software: softwareStats?.length || 0,
    critical_vulnerabilities: criticalVulns,
    high_vulnerabilities: highVulns,
    total_threats: totalThreats,
    blocked_websites: blockedSites,
  };

  // Calculate risk score
  const riskScore = Math.min(100, 
    criticalVulns * 25 + 
    highVulns * 10 + 
    totalThreats * 15 + 
    blockedSites * 5
  );

  const riskLevel = riskScore >= 70 ? "CRÍTICO" :
                    riskScore >= 50 ? "ALTO" :
                    riskScore >= 25 ? "MÉDIO" : "BAIXO";

  // Determine commercial priority
  const commercialPriority = riskScore >= 60 ? "high" :
                             riskScore >= 30 ? "medium" : "low";

  const nextAction = commercialPriority === "high" ? "schedule_call" :
                     commercialPriority === "medium" ? "send_whatsapp" : "await_client";

  // Get tenant name
  const { data: tenantInfo } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  // Generate commercial summary
  const issues: string[] = [];
  if (criticalVulns > 0) issues.push(`${criticalVulns} vulnerabilidade(s) crítica(s)`);
  if (highVulns > 0) issues.push(`${highVulns} vulnerabilidade(s) alta(s)`);
  if (totalThreats > 0) issues.push(`${totalThreats} ameaça(s) detectada(s)`);
  if (blockedSites > 0) issues.push(`${blockedSites} site(s) suspeito(s) acessado(s)`);

  const issuesText = issues.length > 0 ? issues.join(", ") : "ambiente estável";
  const urgencyText = riskLevel === "CRÍTICO" ? "Requer atenção imediata!" :
                      riskLevel === "ALTO" ? "Recomendamos análise em até 48h." :
                      riskLevel === "MÉDIO" ? "Sugerimos revisão na próxima semana." : "Situação sob controle.";

  const commercialSummary = `🛡️ Laudo Periódico - ${tenantInfo?.name || "Cliente"}\n\n` +
    `📊 ${agents.length} computador(es) analisado(s)\n` +
    `⚠️ Encontrado: ${issuesText}\n` +
    `🎯 Nível de Risco: ${riskLevel} (Score: ${riskScore}/100)\n\n` +
    `${urgencyText}\n\n` +
    `Posso explicar os detalhes em 10 minutos?`;

  // Create consolidated report
  const { data: report, error: reportError } = await supabase
    .from("generated_reports")
    .insert({
      tenant_id: tenantId,
      report_type: "full_security",
      title: `Laudo Consolidado - ${new Date().toLocaleDateString("pt-BR")}`,
      risk_score: riskScore,
      risk_level: riskLevel,
      statistics,
      report_data: {
        agents: agents.map((a: any) => a.agent_name),
        generated_at: new Date().toISOString(),
        trigger: triggerType,
      },
      status: "generated",
      triggered_by: "scheduled",
      sales_status: "open",
      commercial_priority: commercialPriority,
      next_action: nextAction,
      commercial_summary: commercialSummary,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (reportError) {
    logger.error("Error creating report:", reportError);
    throw reportError;
  }

  logger.info(`Created report ${report.id} for tenant ${tenantId}`);

  // Registrar execução na tabela report_executions
  const { error: execError } = await supabase
    .from("report_executions")
    .insert({
      tenant_id: tenantId,
      scheduled_report_id: null, // Este é um relatório automático, não de agendamento específico
      report_type: "full_security",
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      metadata: {
        trigger: triggerType,
        report_id: report.id,
        agents_count: agents.length,
        risk_score: riskScore
      }
    });

  if (execError) {
    logger.error("Error logging report execution:", execError);
    // Não lançar erro, apenas logar - o relatório já foi criado
  }

  // Queue notification if high priority
  if (commercialPriority === "high") {
    await supabase.from("notification_queue").insert({
      tenant_id: tenantId,
      report_id: report.id,
      channel: "email",
      priority: "high",
      message_content: commercialSummary,
      scheduled_for: new Date().toISOString(),
    });
    logger.info(`Queued high-priority notification for report ${report.id}`);
  }
}
