import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface I18nStrings {
  subject7: string;
  subject1: string;
  greeting: string;
  trialEnding7: (days: number, date: string) => string;
  enjoying: string;
  warningLabel: string;
  trialEnding1: (date: string) => string;
  choosePlan: string;
  featuresTitle: string;
  features: string[];
  dontLose: string;
  cta7: string;
  cta1: string;
  afterTrial: string;
  footer1: string;
  footer2: string;
  headerSubtitle: string;
}

const translations: Record<string, I18nStrings> = {
  'pt-BR': {
    subject7: (days: number) => `? Seu trial expira em ${days} dias`,
    subject1: '[WARN] ? Seu trial expira amanha!',
    greeting: 'Ola',
    trialEnding7: (days, date) => `Seu periodo de trial esta chegando ao fim e expira em <strong>${days} dias</strong>, no dia <strong>${date}</strong>.`,
    enjoying: 'Esperamos que voce esteja aproveitando todos os recursos premium do CyberShield!',
    warningLabel: '[WARN] ? Atencao:',
    trialEnding1: (date) => `Seu trial expira <strong>amanha, ${date}</strong>!`,
    choosePlan: 'Para continuar aproveitando todos os recursos de protecao avancada, escolha um plano agora.',
    featuresTitle: 'O que voce tem acesso no trial:',
    features: [
      'Monitoramento em tempo real de dispositivos',
      'Scans de virus ilimitados',
      'Dashboard de seguranca avancado',
      'Alertas e notificacoes automaticas',
      'Suporte por email',
    ],
    dontLose: 'Nao perca acesso a esses recursos!',
    cta7: 'Ver Planos Disponiveis',
    cta1: '? Assinar Agora',
    afterTrial: 'Apos o trial, voce sera automaticamente migrado para o plano gratuito com recursos limitados, a menos que escolha um dos nossos planos pagos.',
    footer1: 'CyberShield - Protecao que voce pode confiar',
    footer2: 'Esta e uma mensagem automatica. Por favor, nao responda este email.',
    headerSubtitle: 'Protecao Avancada para seus Dispositivos',
  } as Record<string, unknown>,
  en: {
    subject7: (days: number) => `? Your trial expires in ${days} days`,
    subject1: '[WARN] ? Your trial expires tomorrow!',
    greeting: 'Hello',
    trialEnding7: (days, date) => `Your trial period is ending and expires in <strong>${days} days</strong>, on <strong>${date}</strong>.`,
    enjoying: 'We hope you are enjoying all the premium features of CyberShield!',
    warningLabel: '[WARN] ? Attention:',
    trialEnding1: (date) => `Your trial expires <strong>tomorrow, ${date}</strong>!`,
    choosePlan: 'To continue enjoying all advanced protection features, choose a plan now.',
    featuresTitle: 'What you have access to during the trial:',
    features: [
      'Real-time device monitoring',
      'Unlimited virus scans',
      'Advanced security dashboard',
      'Automatic alerts and notifications',
      'Email support',
    ],
    dontLose: "Don't lose access to these features!",
    cta7: 'View Available Plans',
    cta1: '? Subscribe Now',
    afterTrial: 'After the trial, you will be automatically moved to the free plan with limited features, unless you choose one of our paid plans.',
    footer1: 'CyberShield - Protection you can trust',
    footer2: 'This is an automated message. Please do not reply to this email.',
    headerSubtitle: 'Advanced Protection for your Devices',
  } as Record<string, unknown>,
  es: {
    subject7: (days: number) => `? Tu trial expira en ${days} dias`,
    subject1: '[WARN] ? ?Tu trial expira ma?ana!',
    greeting: 'Hola',
    trialEnding7: (days, date) => `Tu periodo de prueba esta llegando a su fin y expira en <strong>${days} dias</strong>, el <strong>${date}</strong>.`,
    enjoying: '?Esperamos que estes disfrutando de todas las funciones premium de CyberShield!',
    warningLabel: '[WARN] ? Atencion:',
    trialEnding1: (date) => `?Tu trial expira <strong>ma?ana, ${date}</strong>!`,
    choosePlan: 'Para seguir disfrutando de todas las funciones de proteccion avanzada, elige un plan ahora.',
    featuresTitle: 'Lo que tienes acceso durante el trial:',
    features: [
      'Monitoreo en tiempo real de dispositivos',
      'Escaneos de virus ilimitados',
      'Dashboard de seguridad avanzado',
      'Alertas y notificaciones automaticas',
      'Soporte por email',
    ],
    dontLose: '?No pierdas acceso a estas funciones!',
    cta7: 'Ver Planes Disponibles',
    cta1: '? Suscribirse Ahora',
    afterTrial: 'Despues del trial, seras migrado automaticamente al plan gratuito con funciones limitadas, a menos que elijas uno de nuestros planes pagos.',
    footer1: 'CyberShield - Proteccion en la que puedes confiar',
    footer2: 'Este es un mensaje automatico. Por favor, no respondas a este email.',
    headerSubtitle: 'Proteccion Avanzada para tus Dispositivos',
  } as Record<string, unknown>,
};

function getStrings(lang: string): any {
  if (translations[lang]) return translations[lang];
  if (lang?.startsWith('pt')) return translations['pt-BR'];
  if (lang?.startsWith('es')) return translations['es'];
  return translations['pt-BR'];
}

function formatDate(dateStr: string, lang: string): string {
  const locale = lang?.startsWith('en') ? 'en-US' : lang?.startsWith('es') ? 'es-ES' : 'pt-BR';
  return new Date(dateStr).toLocaleDateString(locale);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    const { tenant_id, tenant_name, owner_user_id, trial_end, days_remaining } = await req.json();

    logger.info(`[SEND-TRIAL-REMINDER] Sending ${days_remaining}-day reminder for tenant: ${tenant_id}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get owner's email
    const { data: userData } = await supabase.auth.admin.getUserById(owner_user_id);
    if (!userData.user?.email) {
      throw new Error("Owner email not found");
    }

    // Get tenant language preference
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenant_id)
      .maybeSingle();

    const lang = ((tenantData?.settings as Record<string, unknown>)?.language as string) || 'pt-BR';
    const t = getStrings(lang);

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const trialEndDate = formatDate(trial_end, lang);
    const subject = days_remaining === 7
      ? t.subject7(days_remaining)
      : t.subject1;

    const featuresHtml = t.features.map((f: string) => `<li>[OK]  ${f}</li>`).join('\n                ');

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
              <p style="margin: 10px 0 0 0; opacity: 0.9;">${t.headerSubtitle}</p>
            </div>
            <div class="content">
              <h2>${t.greeting}, ${tenant_name}!</h2>
              
              ${days_remaining === 7 ? `
                <p>${t.trialEnding7(days_remaining, trialEndDate)}</p>
                <p>${t.enjoying}</p>
              ` : `
                <div class="warning">
                  <strong>${t.warningLabel}</strong> ${t.trialEnding1(trialEndDate)}
                </div>
                <p>${t.choosePlan}</p>
              `}
              
              <p><strong>${t.featuresTitle}</strong></p>
              <ul>
                ${featuresHtml}
              </ul>
              
              <p><strong>${t.dontLose}</strong></p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${Deno.env.get("SUPABASE_URL")}/admin/plan-upgrade" class="cta-button">
                  ${days_remaining === 7 ? t.cta7 : t.cta1}
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px;">${t.afterTrial}</p>
            </div>
            <div class="footer">
              <p>${t.footer1}</p>
              <p>${t.footer2}</p>
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
      logger.error("[SEND-TRIAL-REMINDER] Email error:", emailError);
      throw emailError;
    }

    logger.info(`[SEND-TRIAL-REMINDER] Email sent successfully:`, emailData);

    return new Response(
      JSON.stringify({ success: true, email_id: emailData?.id }),
      { headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    logger.error("[SEND-TRIAL-REMINDER] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
