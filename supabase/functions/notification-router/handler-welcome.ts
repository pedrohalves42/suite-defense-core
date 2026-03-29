/**
 * Inlined welcome email handler
 * Original: send-welcome-email/index.ts
 */
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export async function handleWelcome(
  payload: Record<string, unknown>,
  supabase: SupabaseClient,
  requestId: string,
): Promise<Record<string, unknown>> {
  const { email, fullName, userId } = payload as { email?: string; fullName?: string; userId?: string };

  if (!email || !fullName) {
    return { error: 'Email and fullName are required' };
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    logger.error(`[${requestId}] welcome: RESEND_API_KEY not configured`);
    return { success: false, message: 'Email service not configured' };
  }

  const siteUrl = Deno.env.get('SITE_URL') || 'https://cybershield.com.br';
  let tenantName = 'CyberShield';

  if (userId) {
    const { data: userRole } = await supabase
      .from('user_roles').select('tenant_id').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (userRole?.tenant_id) {
      const { data: tenant } = await supabase
        .from('tenants').select('name').eq('id', userRole.tenant_id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (tenant?.name) tenantName = tenant.name;
    }
  }

  const firstName = fullName.split(' ')[0];
  const resend = new Resend(resendApiKey);

  try {
    await resend.emails.send({
      from: 'CyberShield <boas-vindas@cybershield.com.br>',
      to: [email],
      subject: `Bem-vindo ao CyberShield, ${firstName}!`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#00e5a0 0%,#00c896 100%);padding:40px 30px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:32px;font-weight:bold;">🛡️ CyberShield</h1></td></tr>
<tr><td style="padding:40px 30px;">
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;">Ola, ${firstName}! 👋</h2>
<p style="margin:0 0 20px;color:#4a5568;font-size:16px;line-height:1.6;">Bem-vindo ao <strong>CyberShield</strong> - sua plataforma de monitoramento e gestao de seguranca!</p>
<p style="margin:0 0 20px;color:#4a5568;font-size:16px;line-height:1.6;">Estamos felizes em te-lo como parte do tenant <strong>${tenantName}</strong>.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0;">
<tr><td style="padding:15px;background-color:#f7fafc;border-left:4px solid #00e5a0;"><strong style="color:#1a1a1a;">✅ Instalar Agentes</strong><p style="margin:5px 0 0;color:#718096;font-size:14px;">Deploy agentes Windows/Linux em seus endpoints</p></td></tr>
<tr><td style="height:10px;"></td></tr>
<tr><td style="padding:15px;background-color:#f7fafc;border-left:4px solid #00e5a0;"><strong style="color:#1a1a1a;">🔍 Executar Scans</strong><p style="margin:5px 0 0;color:#718096;font-size:14px;">Scan de virus, vulnerabilidades e rede</p></td></tr>
<tr><td style="height:10px;"></td></tr>
<tr><td style="padding:15px;background-color:#f7fafc;border-left:4px solid #00e5a0;"><strong style="color:#1a1a1a;">📊 Monitorar em Tempo Real</strong><p style="margin:5px 0 0;color:#718096;font-size:14px;">Dashboard com metricas, alertas e relatorios</p></td></tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0;"><tr><td align="center">
<a href="${siteUrl}/dashboard" style="display:inline-block;padding:16px 32px;background:linear-gradient(135deg,#00e5a0 0%,#00c896 100%);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Acessar Dashboard</a>
</td></tr></table></td></tr>
<tr><td style="padding:30px;background-color:#f7fafc;text-align:center;border-top:1px solid #e2e8f0;">
<p style="margin:0 0 10px;color:#a0aec0;font-size:14px;"><strong>CyberShield</strong> - Protecao Inteligente</p>
<p style="margin:0;color:#cbd5e0;font-size:12px;">© 2025 CyberShield. Todos os direitos reservados.</p>
</td></tr></table></td></tr></table></body></html>`,
    });
    logger.info(`[${requestId}] welcome: sent to ${email}`);
    return { success: true, message: 'Welcome email sent' };
  } catch (emailError) {
    logger.error(`[${requestId}] welcome: failed`, emailError);
    return { success: false, error: 'Failed to send email', details: String(emailError) };
  }
}
