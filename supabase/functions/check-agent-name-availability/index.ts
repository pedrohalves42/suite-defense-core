import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

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
      console.error('Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
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
      console.error('Auth error:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant_id
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole) {
      console.error('Failed to get user tenant:', roleError?.message);
      return new Response(
        JSON.stringify({ error: 'Failed to determine tenant' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { agentName } = await req.json();
    const tenantId = userRole.tenant_id;

    if (!agentName || agentName.length < 3) {
      console.log('Invalid agent name length:', agentName);
      return new Response(
        JSON.stringify({ 
          available: false, 
          reason: 'Nome deve ter pelo menos 3 caracteres' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Checking agent name availability:', { agentName, tenantId });

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
      console.error('Error checking agent name:', error.message, error);
      return new Response(
        JSON.stringify({ 
          available: false,
          reason: 'Erro ao verificar disponibilidade do nome'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isAvailable = !existingAgent;
    console.log('Agent name check result:', { agentName, tenantId, isAvailable });

    return new Response(
      JSON.stringify({ 
        available: isAvailable,
        reason: existingAgent ? 'Nome já está em uso neste tenant' : null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-agent-name-availability:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        available: false,
        reason: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
