// @ts-nocheck
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { validateCallerTenant } from '../../_shared/validate-caller-tenant.ts';
import { ReportDataRepository } from '../../_shared/repositories/report-data.repository.ts';
import { GenerateComplianceReportUseCase } from '../../_shared/domain/reports/use-cases/generate-compliance-report.use-case.ts';
import { SECURITY_INVARIANTS, TEMPLATE_SECTIONS } from '../../_shared/domain/reports/constants/compliance-templates.ts';

const ComplianceReportSchema = z.object({
  tenant_id: z.string().uuid(),
  template: z.enum(['LGPD', 'ISO_27001', 'SOC2_LITE']).optional(),
  template_type: z.enum(['LGPD', 'ISO_27001', 'SOC2_LITE']).optional(),
  period_start: z.string().max(30).optional(),
  period_end: z.string().max(30).optional(),
}).refine(d => d.template || d.template_type, { message: 'template or template_type is required' });

async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generateHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generateEvidenceHash(data: unknown): Promise<string> {
  const content = JSON.stringify(data);
  const hash = await generateSHA256(content);
  return hash.substring(0, 16);
}

function generateAuditId(): string {
  const uuid = crypto.randomUUID().substring(0, 8).toUpperCase();
  return `LAUDO-${uuid}-${Date.now()}`;
}

export async function handleComplianceReport(
  supabase: any, requestId: string, payload: Record<string, unknown>, req?: Request
): Promise<unknown> {
  const parsed = ComplianceReportSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors };

  const tenantId = parsed.data.tenant_id;
  if (req) {
    const callerValidation = await validateCallerTenant(req, supabase, tenantId);
    if (!callerValidation.authorized) {
      logger.warn(`[report:compliance][${requestId}] Unauthorized tenant access attempt`, {
        tenantId,
        userId: callerValidation.userId ?? null,
        reason: callerValidation.error,
      });
      return {
        success: false,
        error: callerValidation.error ?? 'Access denied',
        __status: callerValidation.statusCode ?? 403,
      };
    }
  }

  const hmacSecret = Deno.env.get("COMPLIANCE_HMAC_SECRET");
  if (!hmacSecret) return { error: "Server configuration error: HMAC secret not configured" };

  const repo = new ReportDataRepository(supabase);
  const useCase = new GenerateComplianceReportUseCase(repo);
  
  const template = (parsed.data.template ?? parsed.data.template_type) as string;
  const periodStart = parsed.data.period_start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = parsed.data.period_end ?? new Date().toISOString();

  const { score, level, raw_data } = await useCase.execute(tenantId, template, periodStart, periodEnd);
  
  const auditId = generateAuditId();
  
  return {
    success: true,
    report: {
      id: auditId,
      tenant_id: tenantId,
      template,
      period: { start: periodStart, end: periodEnd },
      summary: { score, level },
      data: raw_data
    }
  };
}

export async function handleSecurityReport(
  supabase: any, requestId: string, payload: Record<string, unknown>
): Promise<unknown> {
  const tenantId = payload.tenant_id as string;
  if (!tenantId) return { error: 'tenant_id is required' };

  const { data: tenantData } = await supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle();
  const tenantName = tenantData?.name || 'Unknown';
  logger.info(`[report:security][${requestId}] Generating for tenant: ${tenantId} (${tenantName})`);

  const format = (payload.format as string) || 'json';
  const template = ((payload.template as string) || 'LGPD').toUpperCase() as 'LGPD' | 'ISO_27001' | 'SOC2_LITE';
  const agentId = payload.agent_id as string | undefined;

  const agentFilter: Record<string, string> = {};
  if (agentId) agentFilter.agent_id = agentId;

  const [
    { data: agents }, { data: software }, { data: vulnerabilities }, { data: antivirus },
    { data: webActivity }, { data: virusScans }, { data: securityEvents }, { data: failedLogins },
    { data: auditLogs }, { data: blockedWebsites }, { data: blockedAttempts }, { data: tenantFeatures },
  ] = await Promise.all([
    supabase.from('agents').select('id, agent_name, hostname, tenant_id, status, last_heartbeat, agent_version, os_version, ip_address').eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('software_inventory').select('id, agent_id, name, version, publisher, install_date, last_seen_at, tenant_id').eq('tenant_id', tenantId).match(agentFilter),
    supabase.from('vuln_findings').select('severity, title, cve_id, status').eq('tenant_id', tenantId),
    supabase.from('antivirus_status').select('real_time_protection, threats_found, definition_status').eq('tenant_id', tenantId),
    supabase.from('agent_evidence_logs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('security_events').select('severity, event_type').eq('tenant_id', tenantId).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('blocked_websites').select('id, domain, reason, is_active, created_at').eq('tenant_id', tenantId).eq('is_active', true),
    supabase.from('agent_web_activity').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_blocked', true).gte('visited_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('jobs').select('status').eq('tenant_id', tenantId).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('installed_software').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('needs_update', true),
    supabase.from('tenant_risk_scores').select('score').eq('tenant_id', tenantId).order('calculated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const stats = {
    total_agents: agents?.length || 0,
    critical_vulnerabilities: vulnerabilities?.filter(v => v.severity === 'critical').length || 0,
    threats_found: antivirus?.reduce((sum, av) => sum + ((av.threats_found as number) || 0), 0) || 0,
  };

  return { success: true, stats, tenant_name: tenantName };
}

export async function handleExplainableReport(
  supabase: any, requestId: string, payload: Record<string, unknown>
): Promise<unknown> {
  const tenantId = payload.tenant_id as string;
  const userId = payload.user_id as string | undefined;
  const period_start = payload.period_start as string;
  const period_end = payload.period_end as string;

  if (!tenantId || !period_start || !period_end) {
    return { error: 'Missing required fields: tenant_id, period_start, period_end' };
  }

  const { data: insights, error: insightsError } = await supabase
    .from('ai_insights')
    .select(`id, insight_type, title, severity, status, auto_action_executed, resolved_at, evidence,
      ai_actions(id, action_type, status, executed_at, effectiveness_status, effectiveness_evidence, result)`)
    .eq('tenant_id', tenantId)
    .in('status', ['resolved', 'failed', 'ignored'])
    .gte('resolved_at', period_start).lte('resolved_at', period_end)
    .order('resolved_at', { ascending: false });

  if (insightsError) throw insightsError;

  return { success: true, insights: insights || [] };
}
