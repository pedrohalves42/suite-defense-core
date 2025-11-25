import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface AnalyzeUrlBody {
  url: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Autenticacao via JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extrair user do JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tenantId = await getTenantIdForUser(supabase, user.id);
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'Tenant not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: AnalyzeUrlBody = await req.json();
    if (!body.url) {
      return new Response(
        JSON.stringify({ error: 'url required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(body.url);
    } catch {
      return new Response(
        JSON.stringify({ error: 'invalid url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedUrl = body.url.trim();
    const domain = parsed.hostname;

    logger.info(`Analyzing URL: ${normalizedUrl}`);

    // Por enquanto, stub simples
    // Futuramente, integrar com VirusTotal ou outros servicos
    const reputation = 'unknown';
    const score = 0;
    const category = 'unclassified';

    // Gravar em url_reputation
    const { error: insertError } = await supabase
      .from('url_reputation')
      .insert({
        tenant_id: tenantId,
        url: normalizedUrl,
        domain,
        reputation,
        score,
        category,
        details: {},
      });

    if (insertError) {
      logger.error('Failed to insert URL reputation', insertError);
    }

    const result = {
      url: normalizedUrl,
      domain,
      reputation,
      score,
      category,
    };

    logger.success(`URL analyzed: ${domain}`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error('URL analysis failed', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
