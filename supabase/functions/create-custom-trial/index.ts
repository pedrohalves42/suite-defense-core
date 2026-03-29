import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify super admin using user's token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // Check super admin role
    const { data: isSuperAdmin, error: roleError } = await userClient.rpc('is_super_admin', {
      _user_id: user.id,
    });

    if (roleError || !isSuperAdmin) {
      logger.error('[create-custom-trial] Access denied - not super admin:', user.id);
      return new Response(JSON.stringify({ error: 'Super admin access required' }), {
        status: 403,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { email, company_name, contact_name, trial_days = 45, notes } = await req.json();

    if (!email || !company_name) {
      return new Response(JSON.stringify({ error: 'Email and company_name are required' }), {
        status: 400,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    if (trial_days < 1 || trial_days > 365) {
      return new Response(JSON.stringify({ error: 'Trial days must be between 1 and 365' }), {
        status: 400,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // Use service role for creating tenant and user
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if email already exists
    const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some(u => u.email === email);
    
    if (emailExists) {
      return new Response(JSON.stringify({ error: 'Email already registered' }), {
        status: 409,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // Generate temporary password
    const tempPassword = crypto.randomUUID().replace(/-/g, '').substring(0, 16) + 'Aa1!';

    // Create user
    const { data: newUser, error: createUserError } = await serviceClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: contact_name || company_name,
        company_name,
        custom_trial: true,
        trial_days,
      },
    });

    if (createUserError || !newUser.user) {
      logger.error('[create-custom-trial] Failed to create user:', createUserError);
      return new Response(JSON.stringify({ error: 'Failed to create user', details: createUserError?.message }), {
        status: 500,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // Wait for trigger to create tenant
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the tenant created by trigger
    const { data: userRole, error: roleQueryError } = await serviceClient
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', newUser.user.id)
      .single();

    if (roleQueryError || !userRole?.tenant_id) {
      logger.error('[create-custom-trial] Failed to get tenant:', roleQueryError);
      return new Response(JSON.stringify({ error: 'Failed to get tenant' }), {
        status: 500,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const tenantId = userRole.tenant_id;
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trial_days);

    // Update tenant name
    await serviceClient
      .from('tenants')
      .update({ name: company_name })
      .eq('id', tenantId);

    // Update subscription with custom trial end
    await serviceClient
      .from('tenant_subscriptions')
      .update({
        trial_end: trialEnd.toISOString(),
        status: 'trialing',
      })
      .eq('tenant_id', tenantId);

    // Record custom trial
    const { data: customTrial, error: trialError } = await serviceClient
      .from('custom_trials')
      .insert({
        tenant_id: tenantId,
        email,
        company_name,
        contact_name,
        trial_days,
        trial_end: trialEnd.toISOString(),
        created_by: user.id,
        notes,
        status: 'active',
      })
      .select()
      .single();

    if (trialError) {
      logger.error('[create-custom-trial] Failed to record trial:', trialError);
    }

    // Configure tenant features for trial (starter plan)
    await serviceClient.rpc('ensure_tenant_features', {
      p_tenant_id: tenantId,
      p_plan_name: 'starter',
      p_device_quantity: 30,
    });

    logger.info(`[create-custom-trial] Created ${trial_days}-day trial for ${company_name} (${email})`);

    return new Response(JSON.stringify({
      success: true,
      tenant_id: tenantId,
      user_id: newUser.user.id,
      email,
      company_name,
      trial_days,
      trial_end: trialEnd.toISOString(),
      temp_password: tempPassword,
      custom_trial_id: customTrial?.id,
    }), {
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error('[create-custom-trial] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
