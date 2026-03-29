/**
 * Inlined security notification handler
 * Original: send-security-notification/index.ts
 */
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

interface SecurityPayload {
  channel?: 'email' | 'webhook' | 'all';
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  details?: Record<string, unknown>;
  tenantId?: string;
  webhookUrl?: string;
}

interface NotificationResult {
  channel: string;
  success: boolean;
  error?: string;
  messageId?: string;
}

export async function handleSecurity(
  payload: Record<string, unknown>,
  supabase: SupabaseClient,
  requestId: string,
): Promise<Record<string, unknown>> {
  const { channel = 'email', alertType, severity = 'info', title, message, details, tenantId, webhookUrl } =
    payload as SecurityPayload;

  if (!alertType || !message || !channel) {
    return { error: 'Missing required fields: channel, alertType, message' };
  }

  const results: NotificationResult[] = [];
  const nonce = crypto.randomUUID().replace(/-/g, '').substring(0, 16);

  // Get notification settings for tenant
  let notificationSettings: { webhookUrl?: string } | null = null;
  if (tenantId) {
    const { data } = await supabase.from('tenant_settings').select('settings').eq('tenant_id', tenantId).single();
    notificationSettings = (data?.settings as { notifications?: { webhookUrl?: string } })?.notifications ?? null;
  }

  // === EMAIL CHANNEL ===
  if (channel === 'email' || channel === 'all') {
    const emailResult = await sendSecurityEmail(supabase, { alertType, severity, title, message, details, tenantId }, nonce, requestId);
    results.push(emailResult);
  }

  // === WEBHOOK CHANNEL ===
  if (channel === 'webhook' || channel === 'all') {
    const endpoint = webhookUrl || notificationSettings?.webhookUrl;
    if (endpoint) {
      const webhookResult = await sendSecurityWebhook(endpoint, { alertType, severity, title, message, details, tenantId }, nonce, requestId);
      results.push(webhookResult);
    } else if (channel === 'webhook') {
      results.push({ channel: 'webhook', success: false, error: 'No webhook URL configured' });
    }
  }

  // Log notification attempt
  try {
    await supabase.from('notification_log').insert({
      tenant_id: tenantId, notification_type: alertType,
      channels: results.map(r => r.channel),
      payload: { title, message, severity, details }, results,
      created_at: new Date().toISOString(),
    });
  } catch { /* non-critical */ }

  const anySuccessful = results.some(r => r.success);
  return { success: anySuccessful, results, nonce };
}

async function sendSecurityEmail(
  supabase: SupabaseClient,
  payload: { alertType: string; severity: string; title: string; message: string; details?: Record<string, unknown>; tenantId?: string },
  nonce: string,
  requestId: string,
): Promise<NotificationResult> {
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) return { channel: 'email', success: false, error: 'RESEND_API_KEY not configured' };

    let adminEmails: string[] = [];
    if (payload.tenantId) {
      const { data: adminRoles } = await supabase.from('user_roles').select('user_id').eq('tenant_id', payload.tenantId).eq('role', 'admin');
      if (adminRoles && adminRoles.length > 0) {
        const userIds = (adminRoles as Array<{ user_id: string }>).map(r => r.user_id);
        const { data: users } = await supabase.auth.admin.listUsers();
        adminEmails = users.users.filter(u => userIds.includes(u.id)).map(u => u.email).filter((e): e is string => !!e);
      }
    }
    if (adminEmails.length === 0) return { channel: 'email', success: false, error: 'No admin emails found' };

    const severityColors: Record<string, string> = { info: '#3182ce', warning: '#dd6b20', critical: '#e53e3e' };
    const color = severityColors[payload.severity] || '#3182ce';

    // Check for playbook approval
    const isApproval = payload.alertType === 'playbook_approval_required';
    const approvalUrl = (payload.details as Record<string, unknown>)?.approval_url as string;
    const actions = (payload.details as Record<string, unknown>)?.actions as Array<{ type: string; label: string; risk: string }>;
    const expiresAt = (payload.details as Record<string, unknown>)?.expires_at as string;
    let expiresFormatted = '';
    if (expiresAt) try { expiresFormatted = new Date(expiresAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); } catch { expiresFormatted = expiresAt; }

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;background-color:#f5f5f5;margin:0;">
<div style="max-width:600px;margin:0 auto;background-color:white;padding:30px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
<div style="border-bottom:3px solid ${color};padding-bottom:15px;margin-bottom:20px;">
<h1 style="color:${color};margin:0;font-size:24px;">🛡️ CyberShield: ${payload.title}</h1>
<span style="display:inline-block;margin-top:8px;padding:4px 12px;background-color:${color};color:white;border-radius:20px;font-size:12px;text-transform:uppercase;">${payload.severity}</span>
</div>
<div style="margin:20px 0;padding:20px;background-color:#f8f9fa;border-left:4px solid ${color};border-radius:4px;">
<p style="margin:0;color:#333;font-size:16px;line-height:1.6;">${payload.message}</p>
</div>
${isApproval && approvalUrl ? `<div style="margin:24px 0;text-align:center;">
<a href="${approvalUrl}" style="display:inline-block;padding:16px 32px;background-color:#22c55e;color:white;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">✅ Aprovar Agora</a>
<p style="color:#94a3b8;font-size:12px;margin-top:12px;">Este link expira em 24h.</p></div>
${actions?.length ? `<div style="margin:20px 0;padding:16px;background-color:#fef3c7;border-radius:8px;border:1px solid #fcd34d;">
<h4 style="color:#92400e;margin:0 0 12px;font-size:14px;">Acoes:</h4>
<ul style="margin:0;padding-left:20px;color:#78350f;">${actions.map(a => `<li>${a.label} (${a.risk})</li>`).join('')}</ul></div>` : ''}
${expiresFormatted ? `<div style="margin:16px 0;padding:12px;background-color:#fef2f2;border-radius:8px;"><p style="margin:0;color:#991b1b;font-size:13px;">Prazo: ${expiresFormatted}</p></div>` : ''}` : ''}
${payload.details && !isApproval ? `<div style="margin:20px 0;"><h3 style="color:#555;font-size:14px;">Detalhes Tecnicos</h3><pre style="background:#1e1e1e;color:#d4d4d4;padding:15px;border-radius:8px;overflow-x:auto;font-size:13px;">${JSON.stringify(payload.details, null, 2)}</pre></div>` : ''}
<div style="margin-top:30px;padding-top:20px;border-top:1px solid #e2e8f0;color:#718096;font-size:12px;">
<p style="margin:0;">Alerta automatico do CyberShield.</p>
<p style="margin:5px 0 0;">Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
</div></div></body></html>`;

    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send({
      from: 'CyberShield Security <seguranca@cybershield.com.br>',
      to: adminEmails,
      subject: `[${payload.severity.toUpperCase()}] ${payload.alertType} - CyberShield`,
      html: emailHtml,
    });
    return { channel: 'email', success: true, messageId: emailResponse.data?.id };
  } catch (error) {
    logger.error(`[${requestId}] security email error:`, error);
    return { channel: 'email', success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function sendSecurityWebhook(
  webhookUrl: string,
  payload: { alertType: string; severity: string; title: string; message: string; details?: Record<string, unknown>; tenantId?: string },
  nonce: string,
  requestId: string,
): Promise<NotificationResult> {
  try {
    const timestamp = Date.now().toString();
    const body = JSON.stringify({
      event: 'security_alert', alertType: payload.alertType, severity: payload.severity,
      title: payload.title, message: payload.message, details: payload.details,
      tenantId: payload.tenantId, timestamp, nonce,
    });

    const webhookSecret = Deno.env.get('WEBHOOK_SIGNING_SECRET') || 'default-signing-secret';
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`));
    const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CyberShield-Signature': `sha256=${sigHex}`,
        'X-CyberShield-Timestamp': timestamp,
        'X-CyberShield-Nonce': nonce,
      },
      body,
    });
    if (!response.ok) throw new Error(`Webhook returned ${response.status}: ${await response.text()}`);
    return { channel: 'webhook', success: true, messageId: nonce };
  } catch (error) {
    logger.error(`[${requestId}] security webhook error:`, error);
    return { channel: 'webhook', success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
