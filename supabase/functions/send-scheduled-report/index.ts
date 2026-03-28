import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduledReport {
  id: string;
  tenant_id: string;
  name: string;
  recipients: string[];
  include_software_inventory: boolean;
  include_vulnerabilities: boolean;
  include_web_activity: boolean;
  include_antivirus: boolean;
  include_agents_summary: boolean;
  schedule: string;
  day_of_week: number;
  hour: number;
}

interface ReportData {
  agents: Array<Record<string, unknown>>;
  software: Array<Record<string, unknown>>;
  vulnerabilities: Array<Record<string, unknown>>;
  antivirus: Array<Record<string, unknown>>;
  webActivity: Array<Record<string, unknown>>;
  securityEvents: Array<Record<string, unknown>>;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1144: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      logger.error('[send-scheduled-report] RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'RESEND_API_KEY not configured' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendApiKey);

    // Check for specific report to send (manual trigger) or scheduled
    const body = await req.json().catch(() => ({}));
    const manualReportId = body.report_id;
    const manualTenantId = body.tenant_id;

    let reports: ScheduledReport[] = [];

    if (manualReportId) {
      // Manual trigger for specific report
      const { data, error } = await supabase
        .from('scheduled_reports')
        .select('*')
        .eq('id', manualReportId)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Report not found' 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      reports = [data];
    } else {
      // Scheduled trigger - find reports due now
      const now = new Date();
      const currentHour = now.getUTCHours();
      const currentDayOfWeek = now.getUTCDay();

      // Adjust for Sao Paulo timezone (UTC-3)
      const saoPauloHour = (currentHour - 3 + 24) % 24;
      const saoPauloDayOfWeek = saoPauloHour < 0 
        ? (currentDayOfWeek - 1 + 7) % 7 
        : currentDayOfWeek;

      const { data, error } = await supabase
        .from('scheduled_reports')
        .select('*')
        .eq('is_active', true)
        .eq('hour', saoPauloHour)
        .or(`schedule.eq.daily,and(schedule.eq.weekly,day_of_week.eq.${saoPauloDayOfWeek})`);

      if (error) {
        logger.error('[send-scheduled-report] Error fetching reports:', error);
        throw error;
      }

      reports = data || [];
    }

    logger.info(`[send-scheduled-report] Processing ${reports.length} reports`);

    const results = [];

    for (const report of reports) {
      try {
        // Fetch security data for this tenant
        const reportData = await fetchReportData(supabase, report.tenant_id, report);

        // Get tenant info
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', report.tenant_id)
          .single();

        const tenantName = tenant?.name || 'CyberShield';

        // Generate HTML email
        const html = generateReportHtml(reportData, report, tenantName);

        // Send to each recipient
        for (const recipient of report.recipients) {
          const { data: emailData, error: emailError } = await resend.emails.send({
            from: 'CyberShield <reports@resend.dev>',
            to: [recipient],
            subject: `📊 ${report.name} - ${tenantName}`,
            html,
          });

          if (emailError) {
            logger.error(`[send-scheduled-report] Failed to send to ${recipient}:`, emailError);
            
            await supabase.from('notification_log').insert({
              tenant_id: report.tenant_id,
              channel_type: 'email',
              recipient,
              message_preview: `Relatório: ${report.name}`,
              status: 'failed',
              error_message: emailError.message
            });
          } else {
            logger.info(`[send-scheduled-report] Sent to ${recipient}:`, emailData?.id);
            
            await supabase.from('notification_log').insert({
              tenant_id: report.tenant_id,
              channel_type: 'email',
              recipient,
              message_preview: `Relatório: ${report.name}`,
              status: 'sent',
              external_id: emailData?.id,
              sent_at: new Date().toISOString()
            });
          }
        }

        // Update last_sent_at and calculate next_send_at
        const nextSendAt = calculateNextSend(report);
        await supabase
          .from('scheduled_reports')
          .update({ 
            last_sent_at: new Date().toISOString(),
            next_send_at: nextSendAt.toISOString()
          })
          .eq('id', report.id);

        results.push({ report_id: report.id, success: true, recipients: report.recipients.length });

      } catch (error) {
        logger.error(`[send-scheduled-report] Error processing report ${report.id}:`, error);
        results.push({ report_id: report.id, success: false, error: String(error) });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: reports.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[send-scheduled-report] Fatal error:', errorMsg);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMsg 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchReportData(
  supabase: any, 
  tenantId: string, 
  report: ScheduledReport
): Promise<ReportData> {
  const [
    { data: agents },
    { data: software },
    { data: vulnerabilities },
    { data: antivirus },
    { data: webActivity },
    { data: securityEvents },
  ] = await Promise.all([
    report.include_agents_summary 
      ? supabase
          .from('agents')
          .select('id, agent_name, hostname, os_type, status, last_heartbeat, agent_version')
          .eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] }),
    
    report.include_software_inventory
      ? supabase
          .from('software_inventory')
          .select('id, name, version, vendor, agent_id')
          .eq('tenant_id', tenantId)
          .limit(100)
      : Promise.resolve({ data: [] }),
    
    report.include_vulnerabilities
      ? supabase
          .from('vuln_findings')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('severity', { ascending: true })
      : Promise.resolve({ data: [] }),
    
    report.include_antivirus
      ? supabase
          .from('antivirus_status')
          .select('*')
          .eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] }),
    
    report.include_web_activity
      ? supabase
          .from('agent_web_activity')
          .select('domain, category, is_blocked, visit_count')
          .eq('tenant_id', tenantId)
          .order('visit_count', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    
    supabase
      .from('security_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return {
    agents: agents || [],
    software: software || [],
    vulnerabilities: vulnerabilities || [],
    antivirus: antivirus || [],
    webActivity: webActivity || [],
    securityEvents: securityEvents || [],
  };
}

function generateReportHtml(data: ReportData, report: ScheduledReport, tenantName: string): string {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
  const today = new Date().toLocaleDateString('pt-BR');

  const onlineAgents = data.agents.filter(a => {
    if (!a.last_heartbeat) return false;
    const diff = Date.now() - new Date(a.last_heartbeat).getTime();
    return diff < 30 * 60 * 1000; // 30 minutes - unified threshold
  }).length;

  const criticalVulns = data.vulnerabilities.filter(v => v.severity === 'critical').length;
  const highVulns = data.vulnerabilities.filter(v => v.severity === 'high').length;
  const threats = data.antivirus.reduce((sum, a) => sum + (a.threats_found || 0), 0);
  const blockedDomains = data.webActivity.filter(w => w.is_blocked).length;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 700px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🔒 CyberShield</h1>
        <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">${tenantName}</p>
      </td>
    </tr>

    <!-- Report Title -->
    <tr>
      <td style="background-color: #ffffff; padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
        <h2 style="color: #111827; margin: 0; font-size: 20px;">📊 ${report.name}</h2>
        <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 14px;">
          Período: ${weekAgo} - ${today}
        </p>
      </td>
    </tr>

    <!-- Executive Summary -->
    <tr>
      <td style="background-color: #ffffff; padding: 24px 32px;">
        <h3 style="color: #374151; margin: 0 0 16px 0; font-size: 16px; text-transform: uppercase; letter-spacing: 0.05em;">Resumo Executivo</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td width="25%" style="padding: 12px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #16a34a;">${onlineAgents}/${data.agents.length}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">🖥️ Computadores Online</div>
            </td>
            <td width="25%" style="padding: 12px; background-color: ${criticalVulns > 0 ? '#fef2f2' : '#f0fdf4'}; border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${criticalVulns > 0 ? '#dc2626' : '#16a34a'};">${criticalVulns}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">🔴 Vuln. Críticas</div>
            </td>
            <td width="25%" style="padding: 12px; background-color: ${highVulns > 0 ? '#fff7ed' : '#f0fdf4'}; border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${highVulns > 0 ? '#ea580c' : '#16a34a'};">${highVulns}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">🟠 Vuln. Altas</div>
            </td>
            <td width="25%" style="padding: 12px; background-color: ${threats > 0 ? '#fef2f2' : '#f0fdf4'}; border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${threats > 0 ? '#dc2626' : '#16a34a'};">${threats}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">🛡️ Ameaças</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    ${report.include_vulnerabilities && data.vulnerabilities.length > 0 ? `
    <!-- Vulnerabilities Section -->
    <tr>
      <td style="background-color: #ffffff; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
        <h3 style="color: #374151; margin: 0 0 16px 0; font-size: 16px;">🔴 Vulnerabilidades Encontradas (${data.vulnerabilities.length})</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <tr style="background-color: #f9fafb;">
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Severidade</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">CVE</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Software</th>
          </tr>
          ${data.vulnerabilities.slice(0, 10).map(v => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background-color: ${getSeverityColor(v.severity)}; color: white;">${getSeverityLabel(v.severity)}</span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${v.cve_id || 'N/A'}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${v.software_name || 'Desconhecido'}</td>
          </tr>
          `).join('')}
        </table>
        ${data.vulnerabilities.length > 10 ? `<p style="color: #6b7280; font-size: 12px; margin-top: 8px;">...e mais ${data.vulnerabilities.length - 10} vulnerabilidades</p>` : ''}
      </td>
    </tr>
    ` : ''}

    ${report.include_agents_summary && data.agents.length > 0 ? `
    <!-- Agents Section -->
    <tr>
      <td style="background-color: #ffffff; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
        <h3 style="color: #374151; margin: 0 0 16px 0; font-size: 16px;">🖥️ Status dos Computadores (${data.agents.length})</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <tr style="background-color: #f9fafb;">
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Nome</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Status</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Versão</th>
          </tr>
          ${data.agents.slice(0, 10).map(a => {
            const isOnline = a.last_heartbeat && (Date.now() - new Date(a.last_heartbeat).getTime()) < 30 * 60 * 1000;
            return `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${a.agent_name || a.hostname}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
              <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: ${isOnline ? '#16a34a' : '#dc2626'};">
                ${isOnline ? '✅ Online' : '❌ Offline'}
              </span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${a.agent_version || 'N/A'}</td>
          </tr>
            `;
          }).join('')}
        </table>
      </td>
    </tr>
    ` : ''}

    ${report.include_web_activity && data.webActivity.length > 0 ? `
    <!-- Web Activity Section -->
    <tr>
      <td style="background-color: #ffffff; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
        <h3 style="color: #374151; margin: 0 0 16px 0; font-size: 16px;">🌐 Atividade Web (${data.webActivity.length} domínios)</h3>
        ${blockedDomains > 0 ? `<p style="color: #dc2626; font-size: 14px; margin: 0 0 12px 0;">⚠️ ${blockedDomains} acessos bloqueados no período</p>` : ''}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <tr style="background-color: #f9fafb;">
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Domínio</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Categoria</th>
            <th style="padding: 12px; text-align: center; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Visitas</th>
          </tr>
          ${data.webActivity.slice(0, 10).map(w => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${w.domain}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${getCategoryLabel(w.category)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151; text-align: center;">${w.visit_count || 1}</td>
          </tr>
          `).join('')}
        </table>
      </td>
    </tr>
    ` : ''}

    <!-- Footer -->
    <tr>
      <td style="background-color: #f9fafb; padding: 24px 32px; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="color: #6b7280; margin: 0; font-size: 12px;">
          Relatório gerado automaticamente em ${now}
        </p>
        <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 11px;">
          CyberShield - Proteção Inteligente para sua Empresa
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#dc2626';
    case 'high': return '#ea580c';
    case 'medium': return '#ca8a04';
    case 'low': return '#16a34a';
    default: return '#6b7280';
  }
}

function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical': return 'CRÍTICO';
    case 'high': return 'ALTO';
    case 'medium': return 'MÉDIO';
    case 'low': return 'BAIXO';
    default: return severity.toUpperCase();
  }
}

function getCategoryLabel(category: string | null): string {
  const labels: Record<string, string> = {
    social: '📱 Social',
    video: '🎬 Vídeo',
    news: '📰 Notícias',
    work: '💼 Trabalho',
    shopping: '🛒 Compras',
    email: '📧 Email',
    search: '🔍 Busca',
    games: '🎮 Jogos',
    adult: '🔞 Adulto',
    gambling: '🎰 Apostas',
  };
  return labels[category || ''] || category || 'Outro';
}

function calculateNextSend(report: ScheduledReport): Date {
  const now = new Date();
  const next = new Date(now);
  
  // Set to report hour (in Sao Paulo timezone, converted to UTC)
  next.setUTCHours(report.hour + 3, 0, 0, 0);
  
  if (report.schedule === 'daily') {
    // If we're past the send time today, schedule for tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
  } else if (report.schedule === 'weekly') {
    // Find next occurrence of day_of_week
    const currentDay = next.getUTCDay();
    let daysUntil = report.day_of_week - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && next <= now)) {
      daysUntil += 7;
    }
    next.setDate(next.getDate() + daysUntil);
  } else if (report.schedule === 'monthly') {
    // Send on first day of next month
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
  }
  
  return next;
}
