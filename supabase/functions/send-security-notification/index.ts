import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { corsSecurityHeaders, secureCorsPreflightResponse, secureJsonResponse, secureErrorResponse } from '../_shared/security-headers.ts';

/**
 * Multi-channel Security Notification System
 * Supports: Email, Webhook, (future: SMS, Slack, Teams)
 */

interface NotificationPayload {
  channel: 'email' | 'webhook' | 'all';
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return secureCorsPreflightResponse();
  }

  // Validate HTTP method
  if (req.method !== 'POST') {
    return secureErrorResponse('Method not allowed', 405);
  }

  // Validate internal secret for service-to-service calls
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const providedSecret = req.headers.get('X-Internal-Secret');
  
  if (providedSecret !== INTERNAL_SECRET) {
    console.error('[Security Notification] Unauthorized access attempt');
    return secureErrorResponse('Unauthorized', 401);
  }

  try {
    const payload: NotificationPayload = await req.json();
    const { channel, alertType, severity, title, message, details, tenantId, webhookUrl } = payload;

    if (!alertType || !message || !channel) {
      return secureErrorResponse('Missing required fields: channel, alertType, message', 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const results: NotificationResult[] = [];
    const nonce = crypto.randomUUID().replace(/-/g, '').substring(0, 16);

    // Get notification settings for tenant
    let notificationSettings: { webhookUrl?: string } | null = null;
    if (tenantId) {
      const { data } = await supabaseAdmin
        .from('tenant_settings')
        .select('settings')
        .eq('tenant_id', tenantId)
        .single();
      notificationSettings = (data?.settings as { notifications?: { webhookUrl?: string } })?.notifications ?? null;
    }

    // === EMAIL CHANNEL ===
    if (channel === 'email' || channel === 'all') {
      const emailResult = await sendEmailNotification(
        supabaseAdmin,
        { alertType, severity, title, message, details, tenantId },
        nonce
      );
      results.push(emailResult);
    }

    // === WEBHOOK CHANNEL ===
    if (channel === 'webhook' || channel === 'all') {
      const webhookEndpoint = webhookUrl || notificationSettings?.webhookUrl;
      if (webhookEndpoint) {
        const webhookResult = await sendWebhookNotification(
          webhookEndpoint,
          { alertType, severity, title, message, details, tenantId },
          nonce
        );
        results.push(webhookResult);
      } else if (channel === 'webhook') {
        results.push({
          channel: 'webhook',
          success: false,
          error: 'No webhook URL configured'
        });
      }
    }

    // Log notification attempt
    try {
      await supabaseAdmin.from('notification_log').insert({
        tenant_id: tenantId,
        notification_type: alertType,
        channels: results.map(r => r.channel),
        payload: { title, message, severity, details },
        results: results,
        created_at: new Date().toISOString()
      });
    } catch (logErr) {
      console.warn('[Notification] Failed to log notification:', logErr);
    }

    const allSuccessful = results.every(r => r.success);
    const anySuccessful = results.some(r => r.success);

    return secureJsonResponse({
      success: anySuccessful,
      results,
      nonce
    }, allSuccessful ? 200 : (anySuccessful ? 207 : 500));

  } catch (error) {
    console.error('[Security Notification] Error:', error);
    return secureErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});

/**
 * Send email notification with CSP nonce
 */
async function sendEmailNotification(
  supabaseAdmin: SupabaseClient,
  payload: { alertType: string; severity: string; title: string; message: string; details?: Record<string, unknown>; tenantId?: string },
  nonce: string
): Promise<NotificationResult> {
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return {
        channel: 'email',
        success: false,
        error: 'RESEND_API_KEY not configured'
      };
    }

    // Get admin emails for tenant
    let adminEmails: string[] = [];
    if (payload.tenantId) {
      const { data: adminRoles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .eq('tenant_id', payload.tenantId)
        .eq('role', 'admin');

      if (adminRoles && adminRoles.length > 0) {
        const userIds = (adminRoles as Array<{ user_id: string }>).map(r => r.user_id);
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        adminEmails = users.users
          .filter(u => userIds.includes(u.id))
          .map(u => u.email)
          .filter((e): e is string => !!e);
      }
    }

    if (adminEmails.length === 0) {
      return {
        channel: 'email',
        success: false,
        error: 'No admin emails found'
      };
    }

    const severityColors: Record<string, string> = {
      info: '#3182ce',
      warning: '#dd6b20',
      critical: '#e53e3e'
    };

    const severityEmoji: Record<string, string> = {
      info: '[INFO] ?',
      warning: '[WARN] ?',
      critical: '?'
    };

    const color = severityColors[payload.severity] || '#3182ce';
    const emoji = severityEmoji[payload.severity] || '[INFO] ?';

    // Email HTML with CSP nonce for inline styles
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #f5f5f5; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="border-bottom: 3px solid ${color}; padding-bottom: 15px; margin-bottom: 20px;">
      <h1 style="color: ${color}; margin: 0; font-size: 24px;">
        ${emoji} CyberShield: ${payload.title}
      </h1>
      <span style="display: inline-block; margin-top: 8px; padding: 4px 12px; background-color: ${color}; color: white; border-radius: 20px; font-size: 12px; text-transform: uppercase;">
        ${payload.severity}
      </span>
    </div>
    
    <div style="margin: 20px 0; padding: 20px; background-color: #f8f9fa; border-left: 4px solid ${color}; border-radius: 4px;">
      <p style="margin: 0; color: #333; font-size: 16px; line-height: 1.6;">${payload.message}</p>
    </div>
    
    ${payload.details ? `
      <div style="margin: 20px 0;">
        <h3 style="color: #555; margin-bottom: 10px; font-size: 14px; text-transform: uppercase;">Detalhes Tecnicos</h3>
        <pre style="background-color: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 13px; font-family: 'Monaco', 'Consolas', monospace;">${JSON.stringify(payload.details, null, 2)}</pre>
      </div>
    ` : ''}
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 12px;">
      <p style="margin: 0;">Este e um alerta automatico do CyberShield Security Platform.</p>
      <p style="margin: 5px 0 0 0;">Data/Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
      <p style="margin: 5px 0 0 0; color: #a0aec0;">Nonce: ${nonce}</p>
    </div>
  </div>
</body>
</html>`;

    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send({
      from: 'CyberShield Security <seguranca@cybershield.com.br>',
      to: adminEmails,
      subject: `[${payload.severity.toUpperCase()}] ${payload.alertType} - CyberShield`,
      html: emailHtml,
    });

    return {
      channel: 'email',
      success: true,
      messageId: emailResponse.data?.id
    };

  } catch (error) {
    console.error('[Email Notification] Error:', error);
    return {
      channel: 'email',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Send webhook notification with HMAC signature
 */
async function sendWebhookNotification(
  webhookUrl: string,
  payload: { alertType: string; severity: string; title: string; message: string; details?: Record<string, unknown>; tenantId?: string },
  nonce: string
): Promise<NotificationResult> {
  try {
    const timestamp = Date.now().toString();
    const body = JSON.stringify({
      event: 'security_alert',
      alertType: payload.alertType,
      severity: payload.severity,
      title: payload.title,
      message: payload.message,
      details: payload.details,
      tenantId: payload.tenantId,
      timestamp,
      nonce
    });

    // Generate HMAC signature for webhook verification
    const webhookSecret = Deno.env.get('WEBHOOK_SIGNING_SECRET') || 'default-signing-secret';
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`));
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CyberShield-Signature': `sha256=${signatureHex}`,
        'X-CyberShield-Timestamp': timestamp,
        'X-CyberShield-Nonce': nonce
      },
      body
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${await response.text()}`);
    }

    return {
      channel: 'webhook',
      success: true,
      messageId: nonce
    };

  } catch (error) {
    console.error('[Webhook Notification] Error:', error);
    return {
      channel: 'webhook',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
