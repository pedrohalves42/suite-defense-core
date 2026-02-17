import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // FASE 7: Suportar X-Internal-Secret para chamadas internas (ADR-023)
    const internalSecret = req.headers.get('X-Internal-Secret');
    const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    
    let tenantId: string | null = null;
    let supabase;
    let isInternalCall = false;
    let userId: string | null = null;

    // Se for chamada interna autenticada via X-Internal-Secret
    if (internalSecret && INTERNAL_FUNCTION_SECRET && internalSecret === INTERNAL_FUNCTION_SECRET) {
      isInternalCall = true;
      supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Para chamadas internas, tenant_id pode vir do body ou query string
      const url = new URL(req.url);
      tenantId = url.searchParams.get('tenant_id');
      
      if (!tenantId) {
        try {
          const body = await req.clone().json();
          tenantId = body.tenant_id;
        } catch {
          // Body vazio ou inválido - ok para insights gerais
        }
      }
      
      // Para chamadas internas sem tenant_id, buscar todos os tenants
      if (!tenantId) {
        const { data: tenants } = await supabase.from('tenants').select('id').limit(1);
        if (tenants && tenants.length > 0) {
          tenantId = tenants[0].id;
        }
      }
      
      console.log('[ai-get-insights] Internal call authenticated, tenant_id:', tenantId);
    } else {
      // Chamada externa - requer Authorization header
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Missing authorization header' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      // Verificar autenticacao
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = user.id;

      // Buscar roles do usuario (permite multiplos)
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('tenant_id, role')
        .eq('user_id', user.id);

      if (rolesError || !roles || roles.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const adminRole = roles.find(r => ['admin', 'super_admin'].includes(r.role));

      if (!adminRole) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      tenantId = adminRole.tenant_id;

      // Rate limiting: 60 requests per minute per user (apenas para chamadas externas)
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      
      const rateLimitResult = await checkRateLimit(supabaseAdmin, user.id, 'ai-get-insights', {
        maxRequests: 60,
        windowMinutes: 1,
        blockMinutes: 2,
      });

      if (!rateLimitResult.allowed) {
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded',
            resetAt: rateLimitResult.resetAt?.toISOString(),
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validar tenant_id
    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'Tenant ID not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      .eq('tenant_id', tenantId)
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

    // Buscar estatísticas usando contagens individuais para evitar limite de 1000 rows
    const [
      { count: totalCount },
      { count: criticalCount },
      { count: warningCount },
      { count: infoCount },
      { count: acknowledgedCount },
      { count: pendingCount },
    ] = await Promise.all([
      supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
      supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open').eq('severity', 'critical'),
      supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open').eq('severity', 'warning'),
      supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open').eq('severity', 'info'),
      supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open').eq('acknowledged', true),
      supabase.from('ai_insights').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open').eq('acknowledged', false),
    ]);

    const statistics = {
      total: totalCount || 0,
      critical: criticalCount || 0,
      warning: warningCount || 0,
      info: infoCount || 0,
      acknowledged: acknowledgedCount || 0,
      pending: pendingCount || 0,
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
        isInternalCall,
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
