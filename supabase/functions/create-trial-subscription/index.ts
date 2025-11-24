import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole?.tenant_id) {
      return new Response(
        JSON.stringify({ error: 'User has no tenant' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = userRole.tenant_id;

    // Check if subscription already exists
    const { data: existingSubscription } = await supabase
      .from('tenant_subscriptions')
      .select('id')
      .eq('tenant_id', tenantId)
      .single();

    if (existingSubscription) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Subscription already exists',
          subscription_id: existingSubscription.id 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Free plan
    const { data: freePlan } = await supabase
      .from('subscription_plans')
      .select('id')
      .eq('name', 'Free')
      .single();

    if (!freePlan) {
      return new Response(
        JSON.stringify({ error: 'Free plan not found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create trial subscription (14 days)
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    const { data: subscription, error: subscriptionError } = await supabase
      .from('tenant_subscriptions')
      .insert({
        tenant_id: tenantId,
        plan_id: freePlan.id,
        status: 'trialing',
        trial_end: trialEndDate.toISOString(),
        current_period_start: new Date().toISOString(),
        current_period_end: trialEndDate.toISOString(),
      })
      .select()
      .single();

    if (subscriptionError) {
      console.error('Error creating trial subscription:', subscriptionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create trial subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Trial subscription created for tenant ${tenantId}, expires ${trialEndDate.toISOString()}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        subscription,
        trial_days: 14,
        trial_end: trialEndDate.toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-trial-subscription:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
