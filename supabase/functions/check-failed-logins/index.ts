import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders } from '../_shared/cors.ts';

// Validation schema for IP address
const IpAddressSchema = z.string()
  .min(1, 'IP address is required')
  .max(45, 'IP address too long') // IPv6 max length
  .refine(ip => {
    // IPv4 pattern
    const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    // IPv6 pattern (simplified)
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^([0-9a-fA-F]{1,4}:)*::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;
    return ipv4Pattern.test(ip) || ipv6Pattern.test(ip) || ip === 'unknown';
  }, 'Invalid IP address format');

function extractIpAddress(req: Request): string {
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const xRealIp = req.headers.get('x-real-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  
  if (cfConnectingIp) return cfConnectingIp.trim();
  if (xRealIp) return xRealIp.trim();
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

    const rawIpAddress = extractIpAddress(req);
    
    // Validate IP address
    const ipValidation = IpAddressSchema.safeParse(rawIpAddress);
    if (!ipValidation.success) {
      console.warn('Invalid IP address format:', rawIpAddress);
      return new Response(
        JSON.stringify({ error: 'Invalid request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const ipAddress = ipValidation.data;

    if (ipAddress === 'unknown') {
      return new Response(
        JSON.stringify({ error: 'Unable to determine IP address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se IP esta bloqueado
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
          message: 'IP temporariamente bloqueado devido a multiplas tentativas de login falhadas',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Buscar tentativas falhadas nas ultimas 24h
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
      JSON.stringify({ error: 'An error occurred. Please try again.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
