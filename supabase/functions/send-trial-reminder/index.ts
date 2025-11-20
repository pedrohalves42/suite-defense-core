import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, tenant_name, owner_user_id, trial_end, days_remaining } = await req.json();

    console.log(`[SEND-TRIAL-REMINDER] Sending ${days_remaining}-day reminder for tenant: ${tenant_id}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get owner's email
    const { data: userData } = await supabase.auth.admin.getUserById(owner_user_id);
    if (!userData.user?.email) {
      throw new Error("Owner email not found");
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const trialEndDate = new Date(trial_end).toLocaleDateString('pt-BR');
    const subject = days_remaining === 7 
      ? `? Seu trial expira em ${days_remaining} dias`
      : `? Seu trial expira amanha!`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .cta-button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
            .cta-button:hover { background: #5568d3; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">?? CyberShield</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Protecao Avancada para seus Dispositivos</p>
            </div>
            <div class="content">
              <h2>Ola, ${tenant_name}!</h2>
              
              ${days_remaining === 7 ? `
                <p>Seu periodo de trial esta chegando ao fim e expira em <strong>${days_remaining} dias</strong>, no dia <strong>${trialEndDate}</strong>.</p>
                <p>Esperamos que voce esteja aproveitando todos os recursos premium do CyberShield!</p>
              ` : `
                <div class="warning">
                  <strong>[WARN] ? Atencao:</strong> Seu trial expira <strong>amanha, ${trialEndDate}</strong>!
                </div>
                <p>Para continuar aproveitando todos os recursos de protecao avancada, escolha um plano agora.</p>
              `}
              
              <p><strong>O que voce tem acesso no trial:</strong></p>
              <ul>
                <li>[OK]  Monitoramento em tempo real de dispositivos</li>
                <li>[OK]  Scans de virus ilimitados</li>
                <li>[OK]  Dashboard de seguranca avancado</li>
                <li>[OK]  Alertas e notificacoes automaticas</li>
                <li>[OK]  Suporte por email</li>
              </ul>
              
              <p><strong>Nao perca acesso a esses recursos!</strong></p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${Deno.env.get("SUPABASE_URL")}/admin/plan-upgrade" class="cta-button">
                  ${days_remaining === 7 ? 'Ver Planos Disponiveis' : '? Assinar Agora'}
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px;">Apos o trial, voce sera automaticamente migrado para o plano gratuito com recursos limitados, a menos que escolha um dos nossos planos pagos.</p>
            </div>
            <div class="footer">
              <p>CyberShield - Protecao que voce pode confiar</p>
              <p>Esta e uma mensagem automatica. Por favor, nao responda este email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "CyberShield <onboarding@resend.dev>",
      to: [userData.user.email],
      subject: subject,
      html: html,
    });

    if (emailError) {
      console.error("[SEND-TRIAL-REMINDER] Email error:", emailError);
      throw emailError;
    }

    console.log(`[SEND-TRIAL-REMINDER] Email sent successfully:`, emailData);

    return new Response(
      JSON.stringify({ success: true, email_id: emailData?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[SEND-TRIAL-REMINDER] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
