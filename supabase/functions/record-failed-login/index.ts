import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

function extractIpAddress(req: Request): string {
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const xRealIp = req.headers.get('x-real-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  
  if (cfConnectingIp) return cfConnectingIp;
  if (xRealIp) return xRealIp;
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  return 'unknown';
}

interface RecordFailedLoginRequest {
  email?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const ipAddress = extractIpAddress(req);
    const { email }: RecordFailedLoginRequest = await req.json();
    const userAgent = req.headers.get('user-agent');

    if (!ipAddress || ipAddress === 'unknown') {
      return new Response(
        JSON.stringify({ error: 'Unable to determine IP address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Registrar tentativa falhada
    await supabaseAdmin
      .from('failed_login_attempts')
      .insert({
        ip_address: ipAddress,
        email: email || null,
        user_agent: userAgent || null,
      });

    // Verificar se deve bloquear IP (5 tentativas em 15 minutos - mais agressivo)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('failed_login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .gte('created_at', fifteenMinutesAgo);

    if (count && count >= 5) {
      // Bloquear IP por 1 hora (mais restritivo)
      const blockedUntil = new Date(Date.now() + 60 * 60 * 1000);
      await supabaseAdmin
        .from('ip_blocklist')
        .upsert({
          ip_address: ipAddress,
          blocked_until: blockedUntil.toISOString(),
          reason: 'Múltiplas tentativas de login falhadas',
        }, {
          onConflict: 'ip_address',
        });

      // Logar evento de segurança como bloqueado
      await supabaseAdmin
        .from('security_logs')
        .insert({
          ip_address: ipAddress,
          endpoint: '/auth/login',
          attack_type: 'brute_force',
          severity: 'critical',
          blocked: true,
          details: { 
            email, 
            user_agent: userAgent,
            attempt_count: count,
            blocked_until: blockedUntil.toISOString(),
          },
          user_agent: userAgent || null,
        });

      // Enviar alerta em tempo real para admins
      try {
        await supabaseAdmin.functions.invoke('send-brute-force-alert', {
          headers: {
            'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
          },
          body: {
            ipAddress,
            email,
            attemptCount: count,
            blockedUntil: blockedUntil.toISOString(),
            userAgent,
          }
        });
      } catch (alertError) {
        console.error('[BRUTE-FORCE] Failed to send alert:', alertError);
      }
    } else {
      // Logar evento de segurança
      await supabaseAdmin
        .from('security_logs')
        .insert({
          ip_address: ipAddress,
          endpoint: '/auth/login',
          attack_type: 'brute_force',
          severity: 'medium',
          blocked: false,
          details: { email, user_agent: userAgent },
          user_agent: userAgent || null,
        });
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error recording failed login:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
