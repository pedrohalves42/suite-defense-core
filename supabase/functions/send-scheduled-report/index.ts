import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { fetchReportData } from './report-data-fetcher.ts';
import { generateReportHtml, calculateNextSend } from './html-generator.ts';

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

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      logger.error('[send-scheduled-report] RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }), { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const resend = new Resend(resendApiKey);
    const body = await req.json().catch(() => ({}));
    const manualReportId = body.report_id;

    let reports: ScheduledReport[] = [];

    if (manualReportId) {
      const { data, error } = await supabase.from('scheduled_reports').select('*').eq('id', manualReportId).single();
      if (error || !data) {
        return new Response(JSON.stringify({ success: false, error: 'Report not found' }), { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
      reports = [data];
    } else {
      const now = new Date();
      const currentHour = now.getUTCHours();
      const currentDayOfWeek = now.getUTCDay();
      const saoPauloHour = (currentHour - 3 + 24) % 24;
      const saoPauloDayOfWeek = saoPauloHour < 0 ? (currentDayOfWeek - 1 + 7) % 7 : currentDayOfWeek;

      const { data, error } = await supabase.from('scheduled_reports').select('*').eq('is_active', true).eq('hour', saoPauloHour).or(`schedule.eq.daily,and(schedule.eq.weekly,day_of_week.eq.${saoPauloDayOfWeek})`);
      if (error) throw error;
      reports = data || [];
    }

    logger.info(`[send-scheduled-report] Processing ${reports.length} reports`);
    const results = [];

    for (const report of reports) {
      try {
        const reportData = await fetchReportData(supabase, report.tenant_id, report);
        const { data: tenant } = await supabase.from('tenants').select('name').eq('id', report.tenant_id).single();
        const tenantName = tenant?.name || 'CyberShield';
        const html = generateReportHtml(reportData, report, tenantName);

        for (const recipient of report.recipients) {
          const { data: emailData, error: emailError } = await resend.emails.send({
            from: 'CyberShield <reports@resend.dev>', to: [recipient],
            subject: `🛡 ${report.name} - ${tenantName}`, html,
          });

          if (emailError) {
            logger.error(`[send-scheduled-report] Failed to send to ${recipient}:`, emailError);
            await supabase.from('notification_log').insert({ tenant_id: report.tenant_id, channel_type: 'email', recipient, message_preview: `Relatorio: ${report.name}`, status: 'failed', error_message: emailError.message });
          } else {
            logger.info(`[send-scheduled-report] Sent to ${recipient}:`, emailData?.id);
            await supabase.from('notification_log').insert({ tenant_id: report.tenant_id, channel_type: 'email', recipient, message_preview: `Relatorio: ${report.name}`, status: 'sent', external_id: emailData?.id, sent_at: new Date().toISOString() });
          }
        }

        const nextSendAt = calculateNextSend(report);
        await supabase.from('scheduled_reports').update({ last_sent_at: new Date().toISOString(), next_send_at: nextSendAt.toISOString() }).eq('id', report.id);
        results.push({ report_id: report.id, success: true, recipients: report.recipients.length });
      } catch (error) {
        logger.error(`[send-scheduled-report] Error processing report ${report.id}:`, error);
        results.push({ report_id: report.id, success: false, error: String(error) });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: reports.length, results }), { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[send-scheduled-report] Fatal error:', errorMsg);
    return new Response(JSON.stringify({ success: false, error: errorMsg }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
});
