import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { getTenantIdForUser } from '../_shared/tenant.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      logger.error('Missing Authorization header');
      return new Response(
        JSON.stringify({ 
          available: false,
          reason: 'Não autorizado - faça login novamente' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      logger.error('Auth error', userError);
      return new Response(
        JSON.stringify({ 
          available: false,
          reason: 'Não autorizado - faça login novamente' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant_id (handles multiple roles in same tenant)
    const tenantId = await getTenantIdForUser(supabase, user.id);

    if (!tenantId) {
      logger.error('Failed to get user tenant - user has no tenant assigned', { userId: user.id });
      return new Response(
        JSON.stringify({ 
          available: false,
          reason: 'Usuário não possui tenant atribuído' 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { agentName } = await req.json();

    // Validação de tamanho mínimo
    if (!agentName || agentName.length < 3) {
      logger.debug('Invalid agent name length', { agentName });
      return new Response(
        JSON.stringify({ 
          available: false, 
          reason: 'Nome deve ter pelo menos 3 caracteres' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validação de caracteres permitidos (alfanuméricos, hífen, underscore)
    const validNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validNameRegex.test(agentName)) {
      logger.debug('Invalid agent name characters', { agentName });
      return new Response(
        JSON.stringify({ 
          available: false, 
          reason: 'Nome pode conter apenas letras, números, hífen e underscore' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validação de tamanho máximo
    if (agentName.length > 50) {
      logger.debug('Agent name too long', { agentName });
      return new Response(
        JSON.stringify({ 
          available: false, 
          reason: 'Nome deve ter no máximo 50 caracteres' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('Checking agent name availability', { agentName, tenantId });

    // Verificar se já existe (using service role for query)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: existingAgent, error } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('agent_name', agentName)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      logger.error('Error checking agent name', { error: error.message, agentName, tenantId });
      return new Response(
        JSON.stringify({ 
          available: false,
          reason: 'Erro ao verificar disponibilidade do nome'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isAvailable = !existingAgent;
    logger.info('Agent name check result', { agentName, tenantId, isAvailable });

    return new Response(
      JSON.stringify({ 
        available: isAvailable,
        reason: existingAgent ? 'Nome já está em uso neste tenant' : null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Unexpected error in check-agent-name-availability', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ 
        available: false,
        reason: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
