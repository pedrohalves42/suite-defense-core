import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

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

  // Validate internal secret
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const providedSecret = req.headers.get('X-Internal-Secret');

  if (providedSecret !== INTERNAL_SECRET) {
    console.error('[Health Alert] Unauthorized access attempt');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

    // Send email via send-alert-email edge function
    const { error: emailError } = await supabase.functions.invoke('send-alert-email', {
      headers: {
        'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
      },
      body: {
        tenantId,
        alertType,
        subject,
        data,
      }
    });

    if (emailError) {
      console.error('[Alert] Email error:', emailError);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Alert] Email sent successfully');

    return new Response(
      JSON.stringify({ success: true }),
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
