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

    if (!ipAddress || ipAddress === 'unknown') {
      return new Response(
        JSON.stringify({ error: 'Unable to determine IP address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se IP está bloqueado
    const { data: blockedIp } = await supabaseAdmin
      .from('ip_blocklist')
      .select('blocked_until')
      .eq('ip_address', ipAddress)
      .gte('blocked_until', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (blockedIp) {
      return new Response(
        JSON.stringify({
          blocked: true,
          blockedUntil: blockedIp.blocked_until,
          message: 'IP temporariamente bloqueado devido a múltiplas tentativas de login falhadas',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Buscar tentativas falhadas nas últimas 24h
    const { data: attempts, count } = await supabaseAdmin
      .from('failed_login_attempts')
      .select('*', { count: 'exact', head: false })
      .eq('ip_address', ipAddress)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    const requiresCaptcha = (count ?? 0) >= 3;

    return new Response(
      JSON.stringify({
        requiresCaptcha,
        attemptCount: count ?? 0,
        lastAttempt: attempts?.[0]?.created_at || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error checking failed logins:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
