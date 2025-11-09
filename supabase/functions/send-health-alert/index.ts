import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Resend } from 'npm:resend@2.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertRequest {
  tenantId: string;
  alertType: 'agent_offline' | 'jobs_failed';
  subject: string;
  data: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { tenantId, alertType, subject, data }: AlertRequest = await req.json();

    // Get tenant settings
    const { data: settings, error: settingsError } = await supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (settingsError || !settings) {
      throw new Error('Tenant settings not found');
    }

    if (!settings.enable_email_alerts || !settings.alert_email) {
      return new Response(
        JSON.stringify({ message: 'Email alerts disabled or no email configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate email HTML based on alert type
    let emailHtml = '';

    if (alertType === 'agent_offline') {
      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ef4444;">⚠️ Agente Offline</h1>
          <p>O agente <strong>${data.agentName}</strong> está offline.</p>
          <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Tempo Offline:</strong> ${data.minutesOffline} minutos</p>
            <p style="margin: 8px 0 0 0;"><strong>Último Heartbeat:</strong> ${new Date(data.lastHeartbeat).toLocaleString('pt-BR')}</p>
          </div>
          <p>Por favor, verifique a conexão do agente imediatamente.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Este é um alerta automático do sistema CyberShield.
          </p>
        </div>
      `;
    } else if (alertType === 'jobs_failed') {
      const jobsList = data.jobs.map((job: any) => `
        <li style="margin: 8px 0;">
          <strong>${job.type}</strong> - Agente: ${job.agentName}<br>
          <span style="color: #6b7280; font-size: 12px;">ID: ${job.id.substring(0, 8)}... | ${new Date(job.createdAt).toLocaleString('pt-BR')}</span>
        </li>
      `).join('');

      emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ef4444;">❌ Jobs Falharam</h1>
          <p><strong>${data.failedCount}</strong> job(s) falharam nos últimos 5 minutos:</p>
          <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0;">
            <ul style="margin: 0; padding-left: 20px;">
              ${jobsList}
            </ul>
          </div>
          <p>Verifique os logs para mais detalhes sobre as falhas.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Este é um alerta automático do sistema CyberShield.
          </p>
        </div>
      `;
    }

    // Send email
    const emailResponse = await resend.emails.send({
      from: 'CyberShield Alerts <alerts@resend.dev>',
      to: [settings.alert_email],
      subject: subject,
      html: emailHtml,
    });

    console.log('[Alert] Email sent:', emailResponse);

    // Create audit log
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      action: 'send_alert',
      resource_type: 'alert',
      details: { alertType, subject, emailId: emailResponse.id },
      success: true,
    });

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Alert] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
