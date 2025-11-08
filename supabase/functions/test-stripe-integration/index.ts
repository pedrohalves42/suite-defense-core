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
        action: 'test_stripe_integration',
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

    // Check if Stripe keys are configured
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      await createAuditLog({
        supabase,
        userId: user.id,
        action: 'test_stripe_integration',
        resourceType: 'integration',
        details: { error: 'API key not configured' },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Chave da API do Stripe não configurada',
          message: 'A chave STRIPE_SECRET_KEY não está configurada nos secrets do projeto'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test Stripe API by fetching account information
    const testResponse = await fetch('https://api.stripe.com/v1/account', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
      },
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.json();
      console.error('Stripe API test failed:', testResponse.status, errorData);

      await createAuditLog({
        supabase,
        userId: user.id,
        action: 'test_stripe_integration',
        resourceType: 'integration',
        details: { 
          error: 'API test failed',
          status: testResponse.status,
          errorType: errorData.error?.type,
          errorMessage: errorData.error?.message
        },
        request: req,
        success: false,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Falha ao conectar com Stripe',
          message: `Status HTTP ${testResponse.status}: ${errorData.error?.message || 'Verifique se a chave da API está correta'}`,
          details: errorData.error?.type
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accountData = await testResponse.json();

    await createAuditLog({
      supabase,
      userId: user.id,
      action: 'test_stripe_integration',
      resourceType: 'integration',
      details: { 
        success: true,
        account_id: accountData.id,
        business_type: accountData.business_type,
        country: accountData.country
      },
      request: req,
      success: true,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Conexão com Stripe estabelecida com sucesso',
        details: {
          accountId: accountData.id,
          businessType: accountData.business_type,
          country: accountData.country,
          email: accountData.email
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error testing Stripe integration:', error);
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