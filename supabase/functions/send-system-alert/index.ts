import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { Resend } from 'https://esm.sh/resend@4.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

interface AlertPayload {
  event: 'virus_detected' | 'jobs_failed' | 'agent_offline' | 'network_anomaly';
  severity: 'info' | 'warning' | 'critical';
  tenantId: string;
  agentName?: string;
  details: Record<string, any>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate internal secret
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const providedSecret = req.headers.get('X-Internal-Secret');

  if (providedSecret !== INTERNAL_SECRET) {
    console.error('[System Alert] Unauthorized access attempt');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const payload: AlertPayload = await req.json();
    const { event, severity, tenantId, agentName, details } = payload;

    if (!event || !severity || !tenantId) {
      return new Response(
        JSON.stringify({ error: 'event, severity, and tenantId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get tenant settings
    const { data: settings } = await supabaseAdmin
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (!settings) {
      console.error('Tenant settings not found for:', tenantId);
      return new Response(
        JSON.stringify({ error: 'Tenant settings not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: any[] = [];

    // Send email alert
    if (settings.enable_email_alerts && settings.alert_email && Deno.env.get('RESEND_API_KEY')) {
      try {
        const emailResult = await sendEmailAlert(settings.alert_email, event, severity, agentName, details);
        results.push({ type: 'email', success: true, result: emailResult });
      } catch (error) {
        console.error('Failed to send email alert:', error);
        results.push({ type: 'email', success: false, error: String(error) });
      }
    }

    // Send webhook alert
    if (settings.enable_webhook_alerts && settings.alert_webhook_url) {
      try {
        const webhookResult = await sendWebhookAlert(
          settings.alert_webhook_url,
          event,
          severity,
          tenantId,
          agentName,
          details
        );
        results.push({ type: 'webhook', success: true, result: webhookResult });
      } catch (error) {
        console.error('Failed to send webhook alert:', error);
        results.push({ type: 'webhook', success: false, error: String(error) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-system-alert:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendEmailAlert(
  email: string,
  event: string,
  severity: string,
  agentName: string | undefined,
  details: Record<string, any>
): Promise<any> {
  const severityColors = {
    info: '#3b82f6',
    warning: '#f59e0b',
    critical: '#ef4444',
  };

  const severityLabels = {
    info: 'ℹ️ Informação',
    warning: '⚠️ Atenção',
    critical: '🚨 Crítico',
  };

  const eventLabels = {
    virus_detected: 'Vírus Detectado',
    jobs_failed: 'Falhas em Jobs',
    agent_offline: 'Agente Offline',
    network_anomaly: 'Anomalia de Rede',
  };

  const color = severityColors[severity as keyof typeof severityColors] || '#6b7280';
  const severityLabel = severityLabels[severity as keyof typeof severityLabels] || severity;
  const eventLabel = eventLabels[event as keyof typeof eventLabels] || event;

  let detailsHtml = '';
  for (const [key, value] of Object.entries(details)) {
    detailsHtml += `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
          <strong style="color: #374151;">${key}:</strong>
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">
          ${JSON.stringify(value)}
        </td>
      </tr>
    `;
  }

  return await resend.emails.send({
    from: 'CyberShield Alertas <alerts@resend.dev>',
    to: [email],
    subject: `[${severityLabel}] ${eventLabel}${agentName ? ` - ${agentName}` : ''}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                
                <!-- Header -->
                <tr>
                  <td style="background-color: ${color}; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">
                      ${severityLabel}
                    </h1>
                    <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 18px; font-weight: 600;">
                      ${eventLabel}
                    </p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 30px;">
                    ${agentName ? `
                      <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px;">
                        <strong>Agente:</strong> ${agentName}
                      </p>
                    ` : ''}
                    
                    <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px;">
                      <strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}
                    </p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                      <thead>
                        <tr>
                          <th colspan="2" style="background-color: #f3f4f6; padding: 12px; text-align: left; color: #1f2937; font-size: 14px; font-weight: 600;">
                            Detalhes do Alerta
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        ${detailsHtml}
                      </tbody>
                    </table>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                      <tr>
                        <td align="center">
                          <a href="${Deno.env.get('SITE_URL') || 'https://suite-defense-core.lovable.app'}/dashboard" 
                             style="display: inline-block; padding: 14px 28px; background-color: ${color}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                            Ver no Dashboard
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 20px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                      Este é um alerta automático do CyberShield. Não responda este email.
                    </p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });
}

async function sendWebhookAlert(
  webhookUrl: string,
  event: string,
  severity: string,
  tenantId: string,
  agentName: string | undefined,
  details: Record<string, any>
): Promise<any> {
  const payload = {
    event,
    severity,
    tenant_id: tenantId,
    agent_name: agentName,
    details,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'CyberShield-Webhook/1.0',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed with status ${response.status}`);
  }

  return { status: response.status, statusText: response.statusText };
}
