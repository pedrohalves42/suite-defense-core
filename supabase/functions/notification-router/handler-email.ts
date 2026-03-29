/**
 * Inlined email notification handler
 * Original: send-email-notification/index.ts
 */
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626', high: '#ea580c', medium: '#ca8a04', low: '#16a34a', info: '#2563eb',
};
const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critico', high: 'Alto', medium: 'Medio', low: 'Baixo', info: 'Informativo',
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export async function handleEmail(
  payload: Record<string, unknown>,
  supabase: SupabaseClient,
  requestId: string,
): Promise<Record<string, unknown>> {
  const { channel_id, tenant_id, alert_id, recipient, config, alert } = payload as {
    channel_id?: string; tenant_id?: string; alert_id?: string; recipient?: string;
    config?: { email?: string; name?: string };
    alert?: { type?: string; severity?: string; title?: string; message?: string; details?: Record<string, unknown>; agent_name?: string };
  };

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    logger.warn(`[${requestId}] email: RESEND_API_KEY not configured`);
    await supabase.from('notification_log').insert({
      tenant_id, channel_id, alert_id, channel_type: 'email',
      recipient, message_preview: alert?.title?.slice(0, 100),
      status: 'failed', error_message: 'Resend API key not configured',
    }).then(() => {});
    return { success: false, error: 'Email service not configured' };
  }

  const resend = new Resend(resendApiKey);
  const severity = alert?.severity || 'info';
  const severityColor = SEVERITY_COLORS[severity] || '#6b7280';
  const severityLabel = SEVERITY_LABELS[severity] || severity;
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const title = alert?.title || 'CyberShield Alert';
  const message = alert?.message || '';

  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f3f4f6;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;padding:20px;">
<tr><td style="background-color:#1f2937;padding:24px;border-radius:8px 8px 0 0;"><h1 style="color:#fff;margin:0;font-size:24px;">🛡️ CyberShield</h1></td></tr>
<tr><td style="background-color:#fff;padding:32px;border-radius:0 0 8px 8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<div style="display:inline-block;padding:4px 12px;border-radius:9999px;background-color:${severityColor};color:white;font-size:12px;font-weight:600;text-transform:uppercase;margin-bottom:16px;">${severityLabel}</div>
<h2 style="color:#111827;margin:0 0 16px 0;font-size:20px;">${escapeHtml(title)}</h2>
<p style="color:#4b5563;margin:0 0 24px 0;font-size:16px;line-height:1.5;">${escapeHtml(message)}</p>
${alert?.agent_name ? `<div style="background-color:#f9fafb;padding:16px;border-radius:8px;margin-bottom:24px;"><p style="color:#6b7280;margin:0;font-size:14px;"><strong>Computador:</strong> ${escapeHtml(alert.agent_name)}</p></div>` : ''}
${alert?.details ? `<div style="background-color:#f9fafb;padding:16px;border-radius:8px;margin-bottom:24px;"><p style="color:#6b7280;margin:0;font-size:14px;font-family:monospace;white-space:pre-wrap;">${escapeHtml(JSON.stringify(alert.details, null, 2))}</p></div>` : ''}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
<p style="color:#9ca3af;margin:0;font-size:12px;">Enviado em ${timestamp}</p>
</td></tr>
<tr><td style="padding:24px;text-align:center;"><p style="color:#9ca3af;margin:0;font-size:12px;">Este e um alerta automatico do CyberShield.</p></td></tr>
</table></body></html>`;

  const { data, error } = await resend.emails.send({
    from: 'CyberShield <alertas@cybershield.com.br>',
    to: [recipient || config?.email || ''],
    subject: `[${severityLabel}] ${title}`,
    html: htmlContent,
  });

  if (error) {
    logger.error(`[${requestId}] email: Resend error`, { error });
    await supabase.from('notification_log').insert({
      tenant_id, channel_id, alert_id, channel_type: 'email',
      recipient, message_preview: title.slice(0, 100),
      status: 'failed', error_message: error.message || 'Resend API error',
    }).then(() => {});
    return { success: false, error: error.message || 'Failed to send email' };
  }

  logger.info(`[${requestId}] email: sent to ${recipient?.slice(0, 3)}***`);
  await supabase.from('notification_log').insert({
    tenant_id, channel_id, alert_id, channel_type: 'email',
    recipient, message_preview: title.slice(0, 100),
    status: 'sent', external_id: data?.id, sent_at: new Date().toISOString(),
  }).then(() => {});

  return { success: true, email_id: data?.id };
}
