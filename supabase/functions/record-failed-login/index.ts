import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

interface RecordFailedLoginRequest {
  ipAddress: string;
  email?: string;
  userAgent?: string;
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

    const { ipAddress, email, userAgent }: RecordFailedLoginRequest = await req.json();

    if (!ipAddress) {
      return new Response(
        JSON.stringify({ error: 'IP address is required' }),
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
