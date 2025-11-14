import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verificar autenticação e role de admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se é admin
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'super_admin']);

    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[cleanup-test-data] Starting cleanup by user ${user.email}`);

    // Executar limpeza em ordem (respeitar foreign keys)
    const results = {
      installation_analytics: 0,
      agent_system_metrics: 0,
      agent_tokens: 0,
      agents: 0,
      enrollment_keys_used: 0,
    };

    // 1. Limpar eventos de telemetria
    const { error: analyticsError, count: analyticsCount } = await supabaseAdmin
      .from('installation_analytics')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (analyticsError) {
      console.error('[cleanup-test-data] Error cleaning installation_analytics:', analyticsError);
    } else {
      results.installation_analytics = analyticsCount || 0;
      console.log(`[cleanup-test-data] Cleaned ${results.installation_analytics} installation_analytics records`);
    }

    // 2. Limpar métricas de sistema
    const { error: metricsError, count: metricsCount } = await supabaseAdmin
      .from('agent_system_metrics')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (metricsError) {
      console.error('[cleanup-test-data] Error cleaning agent_system_metrics:', metricsError);
    } else {
      results.agent_system_metrics = metricsCount || 0;
      console.log(`[cleanup-test-data] Cleaned ${results.agent_system_metrics} agent_system_metrics records`);
    }

    // 3. Limpar tokens de agente
    const { error: tokensError, count: tokensCount } = await supabaseAdmin
      .from('agent_tokens')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (tokensError) {
      console.error('[cleanup-test-data] Error cleaning agent_tokens:', tokensError);
    } else {
      results.agent_tokens = tokensCount || 0;
      console.log(`[cleanup-test-data] Cleaned ${results.agent_tokens} agent_tokens records`);
    }

    // 4. Limpar agentes
    const { error: agentsError, count: agentsCount } = await supabaseAdmin
      .from('agents')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (agentsError) {
      console.error('[cleanup-test-data] Error cleaning agents:', agentsError);
    } else {
      results.agents = agentsCount || 0;
      console.log(`[cleanup-test-data] Cleaned ${results.agents} agents records`);
    }

    // 5. Limpar chaves de enrollment usadas
    const { error: keysError, count: keysCount } = await supabaseAdmin
      .from('enrollment_keys')
      .delete()
      .not('used_at', 'is', null);

    if (keysError) {
      console.error('[cleanup-test-data] Error cleaning enrollment_keys:', keysError);
    } else {
      results.enrollment_keys_used = keysCount || 0;
      console.log(`[cleanup-test-data] Cleaned ${results.enrollment_keys_used} used enrollment_keys records`);
    }

    console.log('[cleanup-test-data] Cleanup completed successfully:', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test data cleaned successfully',
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[cleanup-test-data] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
