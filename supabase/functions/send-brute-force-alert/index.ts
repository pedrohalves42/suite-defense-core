import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

interface BruteForceAlertRequest {
  ipAddress: string;
  email?: string;
  attemptCount: number;
  blockedUntil: string;
  userAgent?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificar autenticação interna
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('X-Internal-Secret');
    
    if (!authHeader || authHeader !== internalSecret) {
      console.error('[BRUTE-FORCE-ALERT] Unauthorized: Invalid or missing internal secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const {
      ipAddress,
      email,
      attemptCount,
      blockedUntil,
      userAgent
    }: BruteForceAlertRequest = await req.json();

    console.log('[BRUTE-FORCE-ALERT] Processing alert for IP:', ipAddress);

    // Buscar todos os admins e super_admins
    const { data: adminUsers } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, tenant_id, profiles!inner(user_id)')
      .in('role', ['admin', 'super_admin']);

    if (!adminUsers || adminUsers.length === 0) {
      console.log('[BRUTE-FORCE-ALERT] No admin users found');
      return new Response(
        JSON.stringify({ success: true, message: 'No admins to notify' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Criar alertas para cada tenant afetado
    const alertsToCreate = [];
    const processedTenants = new Set<string>();

    for (const admin of adminUsers) {
      if (!admin.tenant_id || processedTenants.has(admin.tenant_id)) {
        continue;
      }
      processedTenants.add(admin.tenant_id);

      alertsToCreate.push({
        tenant_id: admin.tenant_id,
        alert_type: 'brute_force_attack',
        severity: 'critical',
        title: '🚨 Ataque de Força Bruta Detectado e Bloqueado',
        message: `IP ${ipAddress} foi bloqueado após ${attemptCount} tentativas de login falhadas em 15 minutos.`,
        details: {
          ip_address: ipAddress,
          email: email || 'não identificado',
          attempt_count: attemptCount,
          blocked_until: blockedUntil,
          user_agent: userAgent || 'não identificado',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Inserir alertas no banco
    if (alertsToCreate.length > 0) {
      await supabaseAdmin
        .from('system_alerts')
        .insert(alertsToCreate);
      
      console.log(`[BRUTE-FORCE-ALERT] Created ${alertsToCreate.length} alerts`);
    }

    // Enviar email para admins (se RESEND configurado)
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      try {
        const emailBody = `
🚨 ALERTA DE SEGURANÇA - Ataque de Força Bruta Detectado

Um ataque de força bruta foi detectado e bloqueado automaticamente:

IP Atacante: ${ipAddress}
Email Tentado: ${email || 'Não identificado'}
Tentativas: ${attemptCount} em 15 minutos
Bloqueado até: ${new Date(blockedUntil).toLocaleString('pt-BR')}
User Agent: ${userAgent || 'Não identificado'}

O IP foi automaticamente bloqueado por 1 hora.

Recomendações:
- Verifique os logs de segurança no dashboard
- Monitore tentativas adicionais deste IP
- Considere adicionar o IP a uma lista de bloqueio permanente se o ataque persistir

Este é um alerta automático do sistema CyberShield.
        `.trim();

        await supabaseAdmin.functions.invoke('send-alert-email', {
          headers: {
            'X-Internal-Secret': internalSecret || '',
          },
          body: {
            to: 'security@cybershield.local', // Configurar email real
            subject: '🚨 Ataque de Força Bruta Detectado',
            text: emailBody,
          }
        });

        console.log('[BRUTE-FORCE-ALERT] Email alert sent');
      } catch (emailError) {
        console.error('[BRUTE-FORCE-ALERT] Failed to send email:', emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alertsCreated: alertsToCreate.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[BRUTE-FORCE-ALERT] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
