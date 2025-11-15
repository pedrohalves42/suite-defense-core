import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verificar autenticação
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar tenant do usuário
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (roleError || !userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const severity = url.searchParams.get('severity');
    const acknowledged = url.searchParams.get('acknowledged');
    const insightType = url.searchParams.get('insight_type');

    const offset = (page - 1) * limit;

    // Construir query
    let query = supabase
      .from('ai_insights')
      .select('*', { count: 'exact' })
      .eq('tenant_id', userRole.tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Aplicar filtros
    if (severity) {
      query = query.eq('severity', severity);
    }
    if (acknowledged !== null && acknowledged !== undefined) {
      query = query.eq('acknowledged', acknowledged === 'true');
    }
    if (insightType) {
      query = query.eq('insight_type', insightType);
    }

    const { data: insights, error, count } = await query;

    if (error) {
      console.error('[ai-get-insights] Error fetching insights:', error);
      throw error;
    }

    // Buscar estatísticas gerais
    const { data: stats } = await supabase
      .from('ai_insights')
      .select('severity, acknowledged')
      .eq('tenant_id', userRole.tenant_id);

    const statistics = {
      total: stats?.length || 0,
      critical: stats?.filter(s => s.severity === 'critical').length || 0,
      warning: stats?.filter(s => s.severity === 'warning').length || 0,
      info: stats?.filter(s => s.severity === 'info').length || 0,
      acknowledged: stats?.filter(s => s.acknowledged).length || 0,
      pending: stats?.filter(s => !s.acknowledged).length || 0,
    };

    return new Response(
      JSON.stringify({
        insights: insights || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
        statistics,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[ai-get-insights] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
