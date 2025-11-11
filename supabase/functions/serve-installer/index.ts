import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const enrollmentKey = url.pathname.split('/').pop();

    if (!enrollmentKey) {
      return new Response('Enrollment key is required', { 
        status: 400,
        headers: corsHeaders
      });
    }

    const supabaseClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Buscar credenciais pelo enrollment key
    const { data: enrollmentData, error: enrollmentError } = await supabaseClient
      .from('enrollment_keys')
      .select('agent_id, is_active, expires_at')
      .eq('key', enrollmentKey)
      .single();

    if (enrollmentError || !enrollmentData) {
      return new Response('Invalid or expired enrollment key', { 
        status: 404,
        headers: corsHeaders
      });
    }

    if (!enrollmentData.is_active) {
      return new Response('This enrollment key has been used', { 
        status: 410,
        headers: corsHeaders
      });
    }

    if (new Date(enrollmentData.expires_at) < new Date()) {
      return new Response('This enrollment key has expired', { 
        status: 410,
        headers: corsHeaders
      });
    }

    // Buscar token do agente
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('agent_tokens')
      .select('token, hmac_secret')
      .eq('agent_id', enrollmentData.agent_id)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      return new Response('Agent token not found', { 
        status: 404,
        headers: corsHeaders
      });
    }

    // Buscar informações do agente
    const { data: agentData, error: agentError } = await supabaseClient
      .from('agents')
      .select('agent_name, os_type')
      .eq('id', enrollmentData.agent_id)
      .single();

    if (agentError || !agentData) {
      return new Response('Agent not found', { 
        status: 404,
        headers: corsHeaders
      });
    }

    // Determinar qual template usar
    const platform = agentData.os_type || 'windows';
    const templatePath = platform === 'windows' 
      ? '/templates/install-windows-template.ps1'
      : '/templates/install-linux-template.sh';
    
    const agentScriptPath = platform === 'windows'
      ? '/agent-scripts/cybershield-agent-windows.ps1'
      : '/agent-scripts/cybershield-agent-linux.sh';

    // Baixar templates (assumindo que estão acessíveis via HTTP)
    const templateResponse = await fetch(`${SUPABASE_URL}${templatePath}`);
    const agentScriptResponse = await fetch(`${SUPABASE_URL}${agentScriptPath}`);

    if (!templateResponse.ok || !agentScriptResponse.ok) {
      return new Response('Failed to load installation templates', { 
        status: 500,
        headers: corsHeaders
      });
    }

    let templateContent = await templateResponse.text();
    const agentScriptContent = await agentScriptResponse.text();

    // Substituir placeholders
    templateContent = templateContent
      .replace(/\{\{AGENT_TOKEN\}\}/g, tokenData.token)
      .replace(/\{\{HMAC_SECRET\}\}/g, tokenData.hmac_secret)
      .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
      .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, agentScriptContent)
      .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

    // Retornar script pronto para download
    const fileName = platform === 'windows'
      ? `install-${agentData.agent_name}-windows.ps1`
      : `install-${agentData.agent_name}-linux.sh`;

    return new Response(templateContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('Error serving installer:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
