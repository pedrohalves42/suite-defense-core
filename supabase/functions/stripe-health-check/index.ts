import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

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
  logger.info(`[STRIPE-HEALTH-CHECK] ${step}${detailsStr}`);
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(origin) });
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

    // Check if user is admin or super_admin
    // CRITICAL: Super admin IS admin (principle: super admin has all admin privileges)
    const { data: isSuperAdmin, error: superAdminError } = await supabaseClient.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'super_admin'
    });

    if (superAdminError) {
      logStep("Super admin check error", { error: superAdminError });
      throw new Error('Failed to verify admin permissions');
    }

    // If super admin, grant immediate access
    if (isSuperAdmin) {
      logStep("Super admin access verified");
    } else {
      // If not super admin, check for regular admin role
      const { data: isAdmin, error: adminError } = await supabaseClient.rpc('has_role', {
        _user_id: userData.user.id,
        _role: 'admin'
      });

      if (adminError) {
        logStep("Admin check error", { error: adminError });
        throw new Error('Failed to verify admin permissions');
      }

      if (!isAdmin) {
        logStep("Access denied - not admin or super_admin");
        throw new Error("Only admins can access health check");
      }

      logStep("Admin access verified");
    }

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
        message: 'STRIPE_SECRET_KEY nao esta configurado'
      };
      response.overall_status = 'down';
      response.recommendations.push('? Configure STRIPE_SECRET_KEY nos secrets do projeto');
    } else if (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('sk_live_')) {
      logStep("Invalid Stripe key format", { prefix: stripeKey.substring(0, 3) });
      response.checks.stripe_api = {
        status: 'error',
        message: 'Chave invalida: deve comecar com sk_test_ ou sk_live_ (nao use Restricted Keys)'
      };
      response.overall_status = 'down';
      response.recommendations.push('? Atualize STRIPE_SECRET_KEY para uma Secret Key valida (sk_test_* ou sk_live_*)');
      response.recommendations.push('? Restricted Keys (rk_*) nao tem permissoes suficientes');
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
        const err = error as { message?: string; code?: string; statusCode?: number };
        logStep("Stripe API error", { 
          error: err?.message || 'Unknown error', 
          type: err?.type || 'UnknownError' 
        });
        
        let errorMessage = 'Erro ao conectar com Stripe';
        if (err?.type === 'StripeAuthenticationError') {
          errorMessage = 'Chave de API invalida ou sem permissoes';
        } else if (err?.type === 'StripeConnectionError') {
          errorMessage = 'Erro de conexao com Stripe API';
        }
        
        response.checks.stripe_api = {
          status: 'error',
          message: errorMessage
        };
        response.overall_status = 'down';
        response.recommendations.push('? Verificar STRIPE_SECRET_KEY - chave pode estar invalida');
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
          response.recommendations.push('[WARN] ? Produto Starter nao configurado');
        }
        if (!proExists) {
          response.recommendations.push('[WARN] ? Produto Pro nao configurado');
        }
      } else {
        response.checks.products_configured.status = 'missing';
        response.overall_status = 'degraded';
        logStep("No products configured");
        response.recommendations.push('? Nenhum produto Stripe configurado - clique em "Criar Produtos"');
      }
    } catch (error) {
      const err = error as { message?: string; code?: string; statusCode?: number };
      logStep("Error checking products", { error: err?.message || 'Unknown error' });
      response.recommendations.push('[WARN] ? Erro ao verificar produtos no banco de dados');
    }

    // Check 3: Webhook Configuration
    const webhookEndpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`;
    response.checks.webhook_configured = {
      status: 'warning',
      message: 'Configure manualmente no Stripe Dashboard',
      endpoint_url: webhookEndpoint
    };
    
    if (!response.recommendations.some(r => r.includes('webhook'))) {
      response.recommendations.push('? Configure webhook no Stripe Dashboard com os eventos necessarios');
    }

    // Add positive recommendations
    if (response.overall_status === 'healthy') {
      response.recommendations.push('[OK]  Sistema Stripe totalmente operacional!');
    }

    logStep("Health check completed", { status: response.overall_status });

    return new Response(
      JSON.stringify(response),
      { headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
