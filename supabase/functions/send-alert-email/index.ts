import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Resend } from 'https://esm.sh/resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertEmailRequest {
  alertType: string;
  message: string;
  details?: Record<string, any>;
  recipientEmails?: string[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { alertType, message, details, recipientEmails }: AlertEmailRequest = await req.json();

    if (!alertType || !message) {
      return new Response(
        JSON.stringify({ error: 'alertType e message são obrigatórios' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Se não fornecido, buscar emails de todos os admins
    let emails = recipientEmails;
    if (!emails || emails.length === 0) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data: adminRoles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (adminRoles && adminRoles.length > 0) {
        const userIds = adminRoles.map(r => r.user_id);
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        emails = users.users
          .filter(u => userIds.includes(u.id))
          .map(u => u.email)
          .filter(e => e) as string[];
      }
    }

    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nenhum destinatário encontrado' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verificar se RESEND_API_KEY existe
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.warn('RESEND_API_KEY not configured, skipping email send');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email notification disabled (RESEND_API_KEY not configured)',
          emails: emails 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const resend = new Resend(resendApiKey);

    const emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h1 style="color: #e53e3e; border-bottom: 2px solid #e53e3e; padding-bottom: 10px;">
              🚨 CyberShield Alert: ${alertType}
            </h1>
            <div style="margin: 20px 0; padding: 15px; background-color: #fff5f5; border-left: 4px solid #e53e3e; border-radius: 4px;">
              <p style="margin: 0; color: #333; font-size: 16px;">${message}</p>
            </div>
            ${details ? `
              <div style="margin: 20px 0;">
                <h3 style="color: #555;">Detalhes:</h3>
                <pre style="background-color: #f7fafc; padding: 15px; border-radius: 5px; overflow-x: auto; font-size: 13px;">${JSON.stringify(details, null, 2)}</pre>
              </div>
            ` : ''}
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 12px;">
              <p>Este é um alerta automático do sistema CyberShield.</p>
              <p>Data/Hora: ${new Date().toLocaleString('pt-BR')}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: 'CyberShield <onboarding@resend.dev>',
      to: emails,
      subject: `[CyberShield] ${alertType} - ${new Date().toLocaleString('pt-BR')}`,
      html: emailHtml,
    });

    console.log('Alert email sent:', emailResponse);

    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailResponse.data?.id,
        recipients: emails.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-alert-email:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
