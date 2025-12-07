import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailPayload {
  channel_id: string;
  tenant_id: string;
  alert_id?: string;
  recipient: string;
  config: {
    email: string;
    name?: string;
  };
  alert: {
    type: string;
    severity: string;
    title: string;
    message: string;
    details?: Record<string, unknown>;
    agent_name?: string;
  };
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#16a34a',
  info: '#2563eb'
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  info: 'Informativo'
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const payload: EmailPayload = await req.json();
    logger.info('[send-email] Received request', { 
      channel_id: payload.channel_id,
      recipient: payload.recipient?.slice(0, 3) + '***' 
    });

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      logger.warn('[send-email] Resend API key not configured');
      
      await supabase.from('notification_log').insert({
        tenant_id: payload.tenant_id,
        channel_id: payload.channel_id,
        alert_id: payload.alert_id,
        channel_type: 'email',
        recipient: payload.recipient,
        message_preview: payload.alert.title.slice(0, 100),
        status: 'failed',
        error_message: 'Resend API key not configured'
      });

      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Email service not configured. Please set RESEND_API_KEY.' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendApiKey);
    const severityColor = SEVERITY_COLORS[payload.alert.severity] || '#6b7280';
    const severityLabel = SEVERITY_LABELS[payload.alert.severity] || payload.alert.severity;
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Build HTML email
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CyberShield Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td style="background-color: #1f2937; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🛡️ CyberShield</h1>
      </td>
    </tr>
    <tr>
      <td style="background-color: #ffffff; padding: 32px; border-radius: 0 0 8px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="display: inline-block; padding: 4px 12px; border-radius: 9999px; background-color: ${severityColor}; color: white; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px;">
          ${severityLabel}
        </div>
        
        <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 20px;">${escapeHtml(payload.alert.title)}</h2>
        
        <p style="color: #4b5563; margin: 0 0 24px 0; font-size: 16px; line-height: 1.5;">
          ${escapeHtml(payload.alert.message)}
        </p>
        
        ${payload.alert.agent_name ? `
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
          <p style="color: #6b7280; margin: 0; font-size: 14px;">
            <strong>Computador:</strong> ${escapeHtml(payload.alert.agent_name)}
          </p>
        </div>
        ` : ''}
        
        ${payload.alert.details ? `
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
          <p style="color: #6b7280; margin: 0; font-size: 14px; font-family: monospace; white-space: pre-wrap;">
            ${escapeHtml(JSON.stringify(payload.alert.details, null, 2))}
          </p>
        </div>
        ` : ''}
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        
        <p style="color: #9ca3af; margin: 0; font-size: 12px;">
          Enviado em ${timestamp}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px; text-align: center;">
        <p style="color: #9ca3af; margin: 0; font-size: 12px;">
          Este é um alerta automático do CyberShield. Não responda a este email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const { data, error } = await resend.emails.send({
      from: 'CyberShield <alerts@resend.dev>',
      to: [payload.recipient],
      subject: `[${severityLabel}] ${payload.alert.title}`,
      html: htmlContent,
    });

    if (error) {
      logger.error('[send-email] Resend error', { error });
      
      await supabase.from('notification_log').insert({
        tenant_id: payload.tenant_id,
        channel_id: payload.channel_id,
        alert_id: payload.alert_id,
        channel_type: 'email',
        recipient: payload.recipient,
        message_preview: payload.alert.title.slice(0, 100),
        status: 'failed',
        error_message: error.message || 'Resend API error'
      });

      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to send email' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info('[send-email] Email sent successfully', { 
      id: data?.id,
      to: payload.recipient.slice(0, 3) + '***'
    });

    // Log success
    await supabase.from('notification_log').insert({
      tenant_id: payload.tenant_id,
      channel_id: payload.channel_id,
      alert_id: payload.alert_id,
      channel_type: 'email',
      recipient: payload.recipient,
      message_preview: payload.alert.title.slice(0, 100),
      status: 'sent',
      external_id: data?.id,
      sent_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({ 
      success: true, 
      email_id: data?.id 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[send-email] Fatal error', { error: errorMsg });
    
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
