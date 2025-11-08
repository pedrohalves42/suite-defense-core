import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Autenticação necessária' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .single();

    if (roleError || !userRole || userRole.role !== 'admin') {
      await createAuditLog({
        supabase,
        userId: user.id,
        action: 'test_virustotal_integration',
        resourceType: 'integration',
        details: { error: 'Unauthorized' },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ error: 'Acesso negado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get VirusTotal API key
    const virusTotalApiKey = Deno.env.get('VIRUSTOTAL_API_KEY');
    if (!virusTotalApiKey) {
      await createAuditLog({
        supabase,
        userId: user.id,
        action: 'test_virustotal_integration',
        resourceType: 'integration',
        details: { error: 'API key not configured' },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Chave da API do VirusTotal não configurada',
          message: 'A chave VIRUSTOTAL_API_KEY não está configurada nos secrets do projeto'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test VirusTotal API by fetching API usage/quota
    const testResponse = await fetch('https://www.virustotal.com/api/v3/users/current', {
      method: 'GET',
      headers: {
        'x-apikey': virusTotalApiKey,
      },
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error('VirusTotal API test failed:', testResponse.status, errorText);

      await createAuditLog({
        supabase,
        userId: user.id,
        action: 'test_virustotal_integration',
        resourceType: 'integration',
        details: { 
          error: 'API test failed',
          status: testResponse.status,
          statusText: testResponse.statusText
        },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Falha ao conectar com VirusTotal',
          message: `Status HTTP ${testResponse.status}: Verifique se a chave da API está correta`,
          details: testResponse.statusText
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userData = await testResponse.json();

    await createAuditLog({
      supabase,
      userId: user.id,
      action: 'test_virustotal_integration',
      resourceType: 'integration',
      details: { 
        success: true,
        user_id: userData.data?.id,
        quotas: userData.data?.attributes?.quotas
      },
      request: req,
      success: true,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Conexão com VirusTotal estabelecida com sucesso',
        details: {
          userId: userData.data?.id,
          quotas: userData.data?.attributes?.quotas
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error testing VirusTotal integration:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Erro ao testar integração',
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});