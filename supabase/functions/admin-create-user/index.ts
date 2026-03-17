// SECURITY FIX: Removed deprecated std/http/server import (bundling risk per ADR)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateUserRequest {
  username: string;
  password: string;
  full_name: string;
  role: 'admin' | 'operator' | 'viewer';
  tenant_id: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Create user client to verify caller identity
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get caller user
    const { data: { user: caller }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !caller) {
      console.error('[admin-create-user] Auth error:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body first to get tenant_id
    const body: CreateUserRequest = await req.json();
    const { username, password, full_name, role, tenant_id } = body;

    // Validate tenant_id is provided
    if (!tenant_id) {
      console.error('[admin-create-user] Missing tenant_id');
      return new Response(
        JSON.stringify({ success: false, error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify caller is admin IN THE SPECIFIC TENANT requested
    const { data: callerRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .eq('tenant_id', tenant_id)  // Verificar neste tenant específico
      .in('role', ['admin', 'super_admin'])
      .maybeSingle();

    if (roleError || !callerRole) {
      console.error('[admin-create-user] Role check failed:', roleError);
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden: Admin role required in this tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = tenant_id;  // Usar o tenant_id enviado (já validado)
    console.log(`[admin-create-user] Admin verified: ${caller.id}, tenant: ${tenantId}`);

    // Validation
    if (!username || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: username, password, full_name, role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Username validation
    const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/;
    if (!usernameRegex.test(username)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Username must start with a letter, contain only letters, numbers, _ or -, and be 3-32 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Password validation
    if (password.length < 8 || password.length > 72) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password must be 8-72 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasUpper || !hasLower || !hasNumber) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password must contain uppercase, lowercase, and number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Role validation - prevent super_admin assignment
    if (!['admin', 'operator', 'viewer'].includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid role. Must be admin, operator, or viewer' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if username already exists
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Username already exists' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user limit for tenant
    const { count: userCount, error: countError } = await supabaseAdmin
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (countError) {
      console.error('[admin-create-user] Count error:', countError);
    }

    const { data: tenantFeatures } = await supabaseAdmin
      .from('tenant_features')
      .select('quota_limit')
      .eq('tenant_id', tenantId)
      .eq('feature_code', 'max_users')
      .maybeSingle();

    const maxUsers = tenantFeatures?.quota_limit ?? 5; // Default to 5 if no feature found
    const currentUsers = userCount ?? 0;

    console.log(`[admin-create-user] User count: ${currentUsers}/${maxUsers}`);

    if (currentUsers >= maxUsers) {
      return new Response(
        JSON.stringify({ success: false, error: `Limite de usuários atingido (${currentUsers}/${maxUsers}). Faça upgrade do plano.` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate internal email (Supabase requires email)
    const internalEmail = `${username.toLowerCase()}@local.internal`;

    console.log(`[admin-create-user] Creating user: ${username}, role: ${role}, tenant: ${tenantId}`);

    // Create user in auth.users with must_change_password flag
    const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: username.toLowerCase(),
        full_name,
        must_change_password: true,
        created_by: 'admin',
        created_by_user_id: caller.id,
      },
    });

    if (createError || !authUser.user) {
      console.error('[admin-create-user] Auth user creation failed:', createError);
      return new Response(
        JSON.stringify({ success: false, error: createError?.message || 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newUserId = authUser.user.id;
    console.log(`[admin-create-user] Auth user created: ${newUserId}`);

    // Update profile (trigger já criou via handle_new_user, apenas atualizamos username/full_name)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name,
        username: username.toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', newUserId);

    if (profileError) {
      console.error('[admin-create-user] Profile update failed:', profileError);
      // Cleanup: delete auth user (CASCADE deleta profile e user_roles automaticamente)
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Remove any auto-created role from handle_new_user trigger, then insert the correct one
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', newUserId);

    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: newUserId,
        tenant_id: tenantId,
        role,
      });

    if (roleInsertError) {
      console.error('[admin-create-user] Role assignment failed:', roleInsertError);
      // Cleanup: deleteUser com CASCADE já remove profile e user_roles
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to assign user role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Register governance event (ADR-008)
    await supabaseAdmin
      .from('decision_events')
      .insert({
        tenant_id: tenantId,
        rule_code: 'ACCESS_GOVERNANCE',
        decision_source: 'human',
        decision_type: 'user_management',
        action: 'admin_user_created',
        justification: `Usuário ${username} (${role}) criado manualmente por admin via admin-create-user`,
        human_reviewed: true,
        created_at: new Date().toISOString(),
        evidence: {
          username,
          role,
          created_by: caller.id,
          method: 'username_password',
          adr_reference: 'ADR-008',
        },
      });

    // Create audit log
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        tenant_id: tenantId,
        user_id: caller.id,
        action: 'create_user',
        resource_type: 'user',
        resource_id: newUserId,
        success: true,
        details: {
          username,
          role,
          method: 'admin_create_user',
          must_change_password: true,
        },
      });

    console.log(`[admin-create-user] User created successfully: ${username} (${newUserId})`);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUserId,
          username: username.toLowerCase(),
          full_name,
          role,
        },
        message: 'User created. They must change password on first login.',
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[admin-create-user] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
