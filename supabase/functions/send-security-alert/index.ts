import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar autenticação
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { alertType, severity, details } = await req.json();

    if (!alertType || !severity) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: alertType, severity' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar tenant_id do usuário
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const tenantId = userRole?.tenant_id;

    // Extrair IP do request
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                      req.headers.get('x-real-ip') || 
                      'unknown';

    // Inserir log de segurança
    const { error: logError } = await supabase
      .from('security_logs')
      .insert({
        tenant_id: tenantId,
        user_id: user.id,
        ip_address: ipAddress,
        endpoint: '/send-security-alert',
        attack_type: alertType === 'integrity_failure' ? 'control_characters' : 'unauthorized',
        severity: severity,
        blocked: true,
        details: details || {},
        user_agent: req.headers.get('user-agent') || null,
      });

    if (logError) {
      console.error('[SECURITY-ALERT] Failed to log security event:', logError);
    }

    // Log no console para monitoramento
    console.log(`[SECURITY-ALERT] ${severity.toUpperCase()} - ${alertType}`, {
      user_id: user.id,
      tenant_id: tenantId,
      ip_address: ipAddress,
      details,
    });

    // Se for crítico, criar alerta no sistema
    if (severity === 'critical' || severity === 'high') {
      try {
        await supabase
          .from('system_alerts')
          .insert({
            tenant_id: tenantId,
            alert_type: alertType,
            severity: severity,
            title: `Alerta de Segurança: ${alertType}`,
            message: `Tentativa suspeita detectada: ${JSON.stringify(details)}`,
            details: details || {},
          });
      } catch (alertError) {
        console.error('[SECURITY-ALERT] Failed to create system alert:', alertError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Security alert logged successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SECURITY-ALERT] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
