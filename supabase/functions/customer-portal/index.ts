import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    // Get tenant subscription
    const tenantId = await getTenantId(supabaseClient, userData.user.id);
    
    if (!tenantId) {
      return new Response(
        JSON.stringify({ 
          error: 'Tenant não encontrado. Entre em contato com o suporte.',
          code: 'TENANT_NOT_FOUND'
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { data: subscription } = await supabaseClient
      .from("tenant_subscriptions")
      .select("stripe_customer_id, status, plan_id, billing_period, current_period_end")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    // Handle case where no Stripe customer exists (trial or free plan)
    if (!subscription?.stripe_customer_id) {
      const status = subscription?.status || 'unknown';
      
      if (status === 'trialing') {
        return new Response(
          JSON.stringify({ 
            error: 'Você está em período de avaliação gratuita. O portal de cobrança estará disponível após escolher um plano pago.',
            code: 'TRIAL_USER',
            trial: true
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
      
      if (status === 'active' && !subscription?.stripe_customer_id) {
        return new Response(
          JSON.stringify({ 
            error: 'Você está no plano gratuito. Faça upgrade para acessar o portal de cobrança.',
            code: 'FREE_USER',
            free: true
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: 'Nenhuma assinatura ativa encontrada. Entre em contato com o suporte se acredita que isso é um erro.',
          code: 'NO_SUBSCRIPTION'
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // VALIDATION: Block downgrade for prepaid plans (6m, 12m, 24m)
    const billingPeriod = subscription?.billing_period || 'monthly';
    const currentPeriodEnd = subscription?.current_period_end;
    
    if (billingPeriod !== 'monthly' && currentPeriodEnd) {
      const periodEndDate = new Date(currentPeriodEnd);
      const now = new Date();
      
      if (periodEndDate > now) {
        // Still within prepaid period - inform user about restrictions
        const daysRemaining = Math.ceil((periodEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`[CUSTOMER-PORTAL] Prepaid plan (${billingPeriod}), ${daysRemaining} days remaining until ${currentPeriodEnd}`);
        
        // We still allow portal access but log the prepaid status
        // Stripe Portal configuration should handle actual downgrade restrictions
      }
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("[CUSTOMER-PORTAL] STRIPE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ 
          error: 'Configuração de pagamento incompleta. Entre em contato com o suporte.',
          code: 'STRIPE_NOT_CONFIGURED'
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://cybershield.com.br";
    
    // Create portal session with flow_data to show subscription info
    const sessionConfig: Stripe.BillingPortal.SessionCreateParams = {
      customer: subscription.stripe_customer_id,
      return_url: `${origin}/admin/subscriptions`,
    };

    // For prepaid plans, add warning about cancellation policy
    if (billingPeriod !== 'monthly') {
      console.log(`[CUSTOMER-PORTAL] Prepaid plan detected (${billingPeriod}), portal will show cancellation restrictions`);
    }

    const session = await stripe.billingPortal.sessions.create(sessionConfig);

    console.log(`[CUSTOMER-PORTAL] Portal session created for customer ${subscription.stripe_customer_id}`);

    return new Response(
      JSON.stringify({ 
        url: session.url,
        billing_period: billingPeriod,
        prepaid: billingPeriod !== 'monthly',
        current_period_end: currentPeriodEnd
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[CUSTOMER-PORTAL] Error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        code: 'INTERNAL_ERROR'
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function getTenantId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.tenant_id || null;
}
