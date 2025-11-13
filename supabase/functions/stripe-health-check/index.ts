import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthCheckResponse {
  overall_status: 'healthy' | 'degraded' | 'down';
  checks: {
    stripe_api: {
      status: 'ok' | 'error';
      message: string;
      details?: { account_name: string; country: string };
    };
    products_configured: {
      status: 'ok' | 'partial' | 'missing';
      details: {
        starter: { exists: boolean; price_id: string | null };
        pro: { exists: boolean; price_id: string | null };
      };
    };
    webhook_configured: {
      status: 'ok' | 'warning' | 'missing';
      message: string;
      endpoint_url?: string;
    };
  };
  recommendations: string[];
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-HEALTH-CHECK] ${step}${detailsStr}`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");
    logStep("User authenticated", { userId: userData.user.id });

    // Check if user is admin
    const { data: isAdmin, error: roleError } = await supabaseClient.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin'
    });

    if (roleError) {
      logStep("Role check error", { error: roleError });
      throw new Error('Failed to verify admin permissions');
    }

    if (!isAdmin) {
      logStep("Access denied - not admin");
      throw new Error("Only admins can access health check");
    }

    logStep("Admin access verified");

    // Initialize response
    const response: HealthCheckResponse = {
      overall_status: 'healthy',
      checks: {
        stripe_api: {
          status: 'error',
          message: 'Not checked'
        },
        products_configured: {
          status: 'missing',
          details: {
            starter: { exists: false, price_id: null },
            pro: { exists: false, price_id: null }
          }
        },
        webhook_configured: {
          status: 'warning',
          message: 'Cannot verify webhook configuration automatically'
        }
      },
      recommendations: []
    };

    // Check 1: Stripe API Connectivity
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("Stripe key not configured");
      response.checks.stripe_api = {
        status: 'error',
        message: 'STRIPE_SECRET_KEY não está configurado'
      };
      response.overall_status = 'down';
      response.recommendations.push('🔴 Configure STRIPE_SECRET_KEY nos secrets do projeto');
    } else {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        
        // Test API connectivity with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const account = await stripe.accounts.retrieve();
        clearTimeout(timeoutId);
        
        logStep("Stripe API connected", { accountId: account.id });
        
        response.checks.stripe_api = {
          status: 'ok',
          message: 'Conectado com sucesso ao Stripe',
          details: {
            account_name: account.business_profile?.name || account.email || 'N/A',
            country: account.country || 'N/A'
          }
        };
      } catch (error) {
        const err = error as any;
        logStep("Stripe API error", { 
          error: err?.message || 'Unknown error', 
          type: err?.type || 'UnknownError' 
        });
        
        let errorMessage = 'Erro ao conectar com Stripe';
        if (err?.type === 'StripeAuthenticationError') {
          errorMessage = 'Chave de API inválida ou sem permissões';
        } else if (err?.type === 'StripeConnectionError') {
          errorMessage = 'Erro de conexão com Stripe API';
        }
        
        response.checks.stripe_api = {
          status: 'error',
          message: errorMessage
        };
        response.overall_status = 'down';
        response.recommendations.push('🔴 Verificar STRIPE_SECRET_KEY - chave pode estar inválida');
      }
    }

    // Check 2: Products Configuration
    try {
      const { data: plans, error: plansError } = await supabaseClient
        .from('subscription_plans')
        .select('name, stripe_price_id')
        .in('name', ['starter', 'pro']);

      if (plansError) throw plansError;

      const starterPlan = plans?.find(p => p.name === 'starter');
      const proPlan = plans?.find(p => p.name === 'pro');

      response.checks.products_configured.details = {
        starter: {
          exists: !!starterPlan?.stripe_price_id,
          price_id: starterPlan?.stripe_price_id || null
        },
        pro: {
          exists: !!proPlan?.stripe_price_id,
          price_id: proPlan?.stripe_price_id || null
        }
      };

      const starterExists = !!starterPlan?.stripe_price_id;
      const proExists = !!proPlan?.stripe_price_id;

      if (starterExists && proExists) {
        response.checks.products_configured.status = 'ok';
        logStep("All products configured");
      } else if (starterExists || proExists) {
        response.checks.products_configured.status = 'partial';
        response.overall_status = 'degraded';
        logStep("Partial products configuration", { starterExists, proExists });
        
        if (!starterExists) {
          response.recommendations.push('⚠️ Produto Starter não configurado');
        }
        if (!proExists) {
          response.recommendations.push('⚠️ Produto Pro não configurado');
        }
      } else {
        response.checks.products_configured.status = 'missing';
        response.overall_status = 'degraded';
        logStep("No products configured");
        response.recommendations.push('🔴 Nenhum produto Stripe configurado - clique em "Criar Produtos"');
      }
    } catch (error) {
      const err = error as any;
      logStep("Error checking products", { error: err?.message || 'Unknown error' });
      response.recommendations.push('⚠️ Erro ao verificar produtos no banco de dados');
    }

    // Check 3: Webhook Configuration
    const webhookEndpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`;
    response.checks.webhook_configured = {
      status: 'warning',
      message: 'Configure manualmente no Stripe Dashboard',
      endpoint_url: webhookEndpoint
    };
    
    if (!response.recommendations.some(r => r.includes('webhook'))) {
      response.recommendations.push('📘 Configure webhook no Stripe Dashboard com os eventos necessários');
    }

    // Add positive recommendations
    if (response.overall_status === 'healthy') {
      response.recommendations.push('✅ Sistema Stripe totalmente operacional!');
    }

    logStep("Health check completed", { status: response.overall_status });

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
