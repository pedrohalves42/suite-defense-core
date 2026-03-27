import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

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
        block_count: 0,
      });

    // P1 Fix: Usar função de bloqueio progressivo em vez de lógica hardcoded
    // 5 tentativas = 5min, 10 = 15min, 15+ = 60min
    const { data: blockResult, error: blockError } = await supabaseAdmin
      .rpc('check_and_block_ip', {
        p_ip_address: ipAddress,
        p_email: email || null
      });

    if (blockError) {
      logger.error('[BRUTE-FORCE] Error checking block status:', blockError);
    }

    const blockData = blockResult?.[0];
    
    if (blockData?.is_blocked) {
      logger.info(`[BRUTE-FORCE] IP ${ipAddress} blocked until ${blockData.blocked_until} (level ${blockData.block_level})`);
      
      // Enviar alerta apenas para bloqueios de nível 2+ (10+ tentativas)

      if (blockData.block_level >= 2) {
        // Enviar alerta em tempo real para admins
        try {
          await supabaseAdmin.functions.invoke('notification-dispatcher', {
            headers: {
              'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
            },
            body: {
              ipAddress,
              email,
              attemptCount: blockData.attempt_count,
              blockedUntil: blockData.blocked_until,
              userAgent,
              blockLevel: blockData.block_level,
            }
          });
        } catch (alertError) {
          logger.error('[BRUTE-FORCE] Failed to send alert:', alertError);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          blocked: true,
          blockedUntil: blockData.blocked_until,
          blockLevel: blockData.block_level,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        blocked: false,
        attemptCount: blockData?.attempt_count || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error recording failed login:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
