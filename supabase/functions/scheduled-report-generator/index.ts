/**
 * scheduled-report-generator — Migrated to serveInternal
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

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

serveInternal(async (_req, ctx) => {
  const { supabase } = ctx;
  const startedAt = Date.now();

  logger.info("Starting scheduled report generation...");

  const { data: tenants, error: tenantsError } = await supabase
    .from("tenant_subscriptions")
    .select(`tenant_id, status, plan_id, trial_end, subscription_plans!inner ( name )`)
    .in("status", ["active", "trialing"]);

  if (tenantsError) {
    logger.error("Error fetching tenants:", tenantsError);
    throw tenantsError;
  }

  if (!tenants || tenants.length === 0) {
    return { success: true, message: "No active tenants found", generated: 0 };
  }

  logger.info(`Found ${tenants.length} active tenants`);

  let generatedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const tenant of tenants) {
    try {
      const planName = (tenant.subscription_plans as Record<string, unknown>)?.name || "free";
      const frequencyDays = PLAN_FREQUENCIES[planName] || PLAN_FREQUENCIES.starter;

      if (planName === "free" || tenant.status === "trialing") {
        const { data: firstAgent } = await supabase
          .from("agents").select("enrolled_at").eq("tenant_id", tenant.tenant_id)
          .order("enrolled_at", { ascending: true }).limit(1).single();

        if (firstAgent) {
          const enrolledAt = new Date(firstAgent.enrolled_at);
          const hoursSinceEnroll = (Date.now() - enrolledAt.getTime()) / (1000 * 60 * 60);

          const { data: existingTrialReport } = await supabase
            .from("generated_reports").select("id").eq("tenant_id", tenant.tenant_id)
            .eq("triggered_by", "scheduled").limit(1).single();

          if (hoursSinceEnroll >= 48 && !existingTrialReport) {
            await generateTenantReport(supabase, tenant.tenant_id, "trial_48h");
            generatedCount++;
            continue;
          }
        }
        skippedCount++;
        continue;
      }

      if (frequencyDays) {
        const { data: lastReport } = await supabase
          .from("generated_reports").select("created_at").eq("tenant_id", tenant.tenant_id)
          .eq("triggered_by", "scheduled").order("created_at", { ascending: false }).limit(1).single();

        const lastReportDate = lastReport ? new Date(lastReport.created_at) : null;
        const daysSinceLastReport = lastReportDate 
          ? (Date.now() - lastReportDate.getTime()) / (1000 * 60 * 60 * 24)
          : frequencyDays + 1;

        if (daysSinceLastReport >= frequencyDays) {
          await generateTenantReport(supabase, tenant.tenant_id, "scheduled_periodic");
          generatedCount++;
        } else {
          skippedCount++;
        }
      }
    } catch (tenantError) {
      const msg = tenantError instanceof Error ? tenantError.message : String(tenantError);
      logger.error(`Error processing tenant ${tenant.tenant_id}:`, tenantError);
      errors.push(`${tenant.tenant_id}: ${msg}`);
    }
  }

  logger.info(`Scheduled report generation complete: generated=${generatedCount}, skipped=${skippedCount}`);

  const result = {
    success: true,
    processed: tenants.length,
    generated: generatedCount,
    skipped: skippedCount,
    errors: errors.length > 0 ? errors : undefined,
  };

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'scheduled-report-generator',
    p_success: true,
    p_duration_ms: Date.now() - startedAt,
    p_result: result,
    p_processed_count: generatedCount,
    p_job_source: 'cron',
  });

  return result;
});

async function generateTenantReport(supabase: SupabaseClient, tenantId: string, triggerType: string): Promise<void> {
  logger.info(`Generating ${triggerType} report for tenant ${tenantId}`);

  const { data: agents } = await supabase
    .from("agents").select("id, agent_name").eq("tenant_id", tenantId).eq("status", "active");

  if (!agents || agents.length === 0) {
    logger.info(`No active agents for tenant ${tenantId}, skipping report`);
    return;
  }

  const [{ data: softwareStats }, { data: vulnStats }, { data: avStats }, { data: webStats }] = await Promise.all([
    supabase.from("software_inventory").select("id").eq("tenant_id", tenantId),
    supabase.from("vuln_findings").select("severity").eq("tenant_id", tenantId),
    supabase.from("antivirus_status").select("threats_found").eq("tenant_id", tenantId),
    supabase.from("agent_web_activity").select("is_blocked").eq("tenant_id", tenantId),
  ]);

  const criticalVulns = vulnStats?.filter((v: Record<string, unknown>) => v.severity === "critical").length || 0;
  const highVulns = vulnStats?.filter((v: Record<string, unknown>) => v.severity === "high").length || 0;
  const totalThreats = avStats?.reduce((sum: number, a: { threats_found?: number }) => sum + (a.threats_found || 0), 0) || 0;
  const blockedSites = webStats?.filter((w: Record<string, unknown>) => w.is_blocked).length || 0;

  const statistics = {
    total_agents: agents.length,
    total_software: softwareStats?.length || 0,
    critical_vulnerabilities: criticalVulns,
    high_vulnerabilities: highVulns,
    total_threats: totalThreats,
    blocked_websites: blockedSites,
  };

  const riskScore = Math.min(100, criticalVulns * 25 + highVulns * 10 + totalThreats * 15 + blockedSites * 5);
  const riskLevel = riskScore >= 70 ? "CRITICO" : riskScore >= 50 ? "ALTO" : riskScore >= 25 ? "MEDIO" : "BAIXO";
  const commercialPriority = riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low";
  const nextAction = commercialPriority === "high" ? "schedule_call" : commercialPriority === "medium" ? "send_whatsapp" : "await_client";

  const { data: tenantInfo } = await supabase.from("tenants").select("name").eq("id", tenantId).single();

  const issues: string[] = [];
  if (criticalVulns > 0) issues.push(`${criticalVulns} vulnerabilidade(s) critica(s)`);
  if (highVulns > 0) issues.push(`${highVulns} vulnerabilidade(s) alta(s)`);
  if (totalThreats > 0) issues.push(`${totalThreats} ameaca(s) detectada(s)`);
  if (blockedSites > 0) issues.push(`${blockedSites} site(s) suspeito(s) acessado(s)`);

  const issuesText = issues.length > 0 ? issues.join(", ") : "ambiente estavel";
  const urgencyText = riskLevel === "CRITICO" ? "Requer atencao imediata!" :
                      riskLevel === "ALTO" ? "Recomendamos analise em ate 48h." :
                      riskLevel === "MEDIO" ? "Sugerimos revisao na proxima semana." : "Situacao sob controle.";

  const commercialSummary = `🛡 Laudo Periodico - ${tenantInfo?.name || "Cliente"}\n\n` +
    `✅ ${agents.length} computador(es) analisado(s)\n` +
    `⚠️ Encontrado: ${issuesText}\n` +
    `📊 Nivel de Risco: ${riskLevel} (Score: ${riskScore}/100)\n\n` +
    `${urgencyText}\n\n` +
    `Posso explicar os detalhes em 10 minutos?`;

  const { data: report, error: reportError } = await supabase
    .from("generated_reports")
    .insert({
      tenant_id: tenantId, report_type: "full_security",
      title: `Laudo Consolidado - ${new Date().toLocaleDateString("pt-BR")}`,
      risk_score: riskScore, risk_level: riskLevel, statistics,
      report_data: { agents: agents.map((a: Record<string, unknown>) => a.agent_name), generated_at: new Date().toISOString(), trigger: triggerType },
      status: "generated", triggered_by: "scheduled", sales_status: "open",
      commercial_priority: commercialPriority, next_action: nextAction, commercial_summary: commercialSummary,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select().single();

  if (reportError) { logger.error("Error creating report:", reportError); throw reportError; }

  logger.info(`Created report ${report.id} for tenant ${tenantId}`);

  const { error: execError } = await supabase.from("report_executions").insert({
    tenant_id: tenantId, scheduled_report_id: null, report_type: "full_security",
    status: "completed", started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    metadata: { trigger: triggerType, report_id: report.id, agents_count: agents.length, risk_score: riskScore },
  });
  if (execError) logger.error("Error logging report execution:", execError);

  if (commercialPriority === "high") {
    await supabase.from("notification_queue").insert({
      tenant_id: tenantId, report_id: report.id, channel: "email", priority: "high",
      message_content: commercialSummary, scheduled_for: new Date().toISOString(),
    });
    logger.info(`Queued high-priority notification for report ${report.id}`);
  }
}
