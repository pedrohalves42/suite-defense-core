import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { Resend } from 'https://esm.sh/resend@4.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const siteUrl = Deno.env.get('SITE_URL') || 'https://suite-defense-core.lovable.app';

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { email, fullName, userId } = await req.json();

    if (!email || !fullName) {
      return new Response(
        JSON.stringify({ error: 'Email and fullName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if RESEND_API_KEY is configured
    if (!Deno.env.get('RESEND_API_KEY')) {
      console.error('RESEND_API_KEY not configured, skipping welcome email');
      return new Response(
        JSON.stringify({ success: false, message: 'Email service not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant info
    let tenantName = 'CyberShield';
    if (userId) {
    const { data: userRole } = await supabaseAdmin
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', userId)
        .single();

      if (userRole?.tenant_id) {
        const { data: tenant } = await supabaseAdmin
          .from('tenants')
          .select('name')
          .eq('id', userRole.tenant_id)
          .single();
        
        if (tenant?.name) {
          tenantName = tenant.name;
        }
      }
    }

    // Send welcome email
    const firstName = fullName.split(' ')[0];
    
    try {
      await resend.emails.send({
        from: 'CyberShield <onboarding@resend.dev>',
        to: [email],
        subject: `Bem-vindo ao CyberShield, ${firstName}!`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Bem-vindo ao CyberShield</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                    
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #00e5a0 0%, #00c896 100%); padding: 40px 30px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold;">
                          🛡️ CyberShield
                        </h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px 30px;">
                        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 24px; font-weight: 600;">
                          Olá, ${firstName}! 👋
                        </h2>
                        
                        <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                          Bem-vindo ao <strong>CyberShield</strong> - sua plataforma de monitoramento e gestão de segurança!
                        </p>
                        
                        <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                          Estamos felizes em tê-lo como parte do tenant <strong>${tenantName}</strong>. Aqui está o que você pode fazer agora:
                        </p>
                        
                        <!-- Features -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                          <tr>
                            <td style="padding: 15px; background-color: #f7fafc; border-left: 4px solid #00e5a0; margin-bottom: 10px;">
                              <strong style="color: #1a1a1a; font-size: 16px;">✅ Instalar Agentes</strong>
                              <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">
                                Deploy agentes Windows/Linux em seus endpoints
                              </p>
                            </td>
                          </tr>
                          <tr><td style="height: 10px;"></td></tr>
                          <tr>
                            <td style="padding: 15px; background-color: #f7fafc; border-left: 4px solid #00e5a0; margin-bottom: 10px;">
                              <strong style="color: #1a1a1a; font-size: 16px;">🔍 Executar Scans</strong>
                              <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">
                                Scan de vírus, vulnerabilidades e rede
                              </p>
                            </td>
                          </tr>
                          <tr><td style="height: 10px;"></td></tr>
                          <tr>
                            <td style="padding: 15px; background-color: #f7fafc; border-left: 4px solid #00e5a0;">
                              <strong style="color: #1a1a1a; font-size: 16px;">📊 Monitorar em Tempo Real</strong>
                              <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">
                                Dashboard com métricas, alertas e relatórios
                              </p>
                            </td>
                          </tr>
                        </table>
                        
                        <!-- CTA Button -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                          <tr>
                            <td align="center">
                              <a href="${siteUrl}/dashboard" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #00e5a0 0%, #00c896 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 229, 160, 0.3);">
                                Acessar Dashboard
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="margin: 30px 0 20px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                          <strong>Precisa de ajuda?</strong>
                        </p>
                        
                        <p style="margin: 0 0 10px 0; color: #718096; font-size: 14px; line-height: 1.6;">
                          📖 <a href="${siteUrl}" style="color: #00e5a0; text-decoration: none;">Documentação Completa</a><br>
                          🚀 <a href="${siteUrl}" style="color: #00e5a0; text-decoration: none;">Guia de Início Rápido</a><br>
                          💬 <a href="${siteUrl}#contato" style="color: #00e5a0; text-decoration: none;">Falar com Suporte</a>
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 30px; background-color: #f7fafc; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="margin: 0 0 10px 0; color: #a0aec0; font-size: 14px;">
                          <strong>CyberShield</strong> - Proteção Inteligente para Seus Endpoints
                        </p>
                        <p style="margin: 0; color: #cbd5e0; font-size: 12px;">
                          © 2025 CyberShield. Todos os direitos reservados.
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

      console.log('Welcome email sent successfully to:', email);
      
      return new Response(
        JSON.stringify({ success: true, message: 'Welcome email sent' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the request if email fails
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send email', details: String(emailError) }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in send-welcome-email:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
