import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    // Verificar autenticacao
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Verificar se o usuario e admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant_id for security validation
    const tenantId = await getTenantIdForUser(supabase, user.id);
    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'User has no tenant assigned' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Obter agent_name do body
    const body = await req.json();
    const agentName = body.agent_name;

    if (!agentName) {
      return new Response(
        JSON.stringify({ error: 'Missing agent_name in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[diagnose-agent] Starting diagnosis', { 
      requestId, 
      agentName,
      userId: user.id,
      tenantId 
    });

    // Chamar funcao de diagnostico (agora com validacao de tenant no RPC)
    const { data: diagnosis, error: diagnosisError } = await supabase.rpc('diagnose_agent', {
      p_agent_name: agentName
    });

    if (diagnosisError) {
      logger.error('[diagnose-agent] Diagnosis failed', { 
        requestId, 
        agentName,
        error: diagnosisError.message 
      });
      throw diagnosisError;
    }

    logger.info('[diagnose-agent] Diagnosis complete', { 
      requestId, 
      agentName,
      isHealthy: diagnosis.is_healthy,
      issuesCount: diagnosis.issues?.length || 0
    });

    return new Response(
      JSON.stringify(diagnosis),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const err = error as Error;
    logger.error('[diagnose-agent] Error', { 
      requestId, 
      error: err.message,
      stack: err.stack 
    });

    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: err.message,
        requestId 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
