import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[set-active-tenant] Starting request processing')
    
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[set-active-tenant] Missing or invalid authorization header')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Client with user's auth for validation
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Admin client for updating user metadata
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Validate user token
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log('[set-active-tenant] Invalid token:', authError?.message)
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[set-active-tenant] User ${user.id} requesting tenant switch`)

    const { tenant_id } = await req.json()
    
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify user has access to the requested tenant
    const { data: access, error: accessError } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .limit(1)
      .maybeSingle()

    if (accessError) {
      console.error('[set-active-tenant] Access check error:', accessError)
      return new Response(JSON.stringify({ error: 'Failed to verify access' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!access) {
      console.log(`[set-active-tenant] User ${user.id} denied access to tenant ${tenant_id}`)
      return new Response(JSON.stringify({ error: 'Tenant access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch all tenants the user has access to
    const { data: allRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)

    if (rolesError) {
      console.error('[set-active-tenant] Error fetching roles:', rolesError)
      return new Response(JSON.stringify({ error: 'Failed to fetch user roles' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if user is super admin
    const isSuperAdmin = allRoles?.some(r => r.role === 'super_admin') ?? false
    const tenantIds = [...new Set(allRoles?.map(r => r.tenant_id) ?? [])]

    console.log(`[set-active-tenant] User has access to ${tenantIds.length} tenants, is_super_admin: ${isSuperAdmin}`)

    // Get previous active tenant for audit
    const previousTenantId = user.app_metadata?.active_tenant_id

    // Update user's app_metadata with active_tenant_id
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          ...user.app_metadata,
          active_tenant_id: tenant_id,
          tenants: tenantIds,
          is_super_admin: isSuperAdmin
        }
      }
    )

    if (updateError) {
      console.error('[set-active-tenant] Failed to update user metadata:', updateError)
      return new Response(JSON.stringify({ error: 'Failed to update session' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Log the tenant switch in audit_logs
    if (previousTenantId !== tenant_id) {
      try {
        await supabaseAdmin.from('audit_logs').insert({
          tenant_id: tenant_id,
          user_id: user.id,
          action: 'tenant_switched',
          target_type: 'tenant',
          target_id: tenant_id,
          details: { 
            previous_tenant_id: previousTenantId,
            new_tenant_id: tenant_id,
            timestamp: new Date().toISOString()
          }
        })
        console.log(`[set-active-tenant] Audit log recorded: ${previousTenantId} → ${tenant_id}`)
      } catch (auditError) {
        console.warn('[set-active-tenant] Failed to record audit log:', auditError)
        // Non-blocking - continue even if audit fails
      }
    }

    console.log(`[set-active-tenant] Successfully switched user ${user.id} to tenant ${tenant_id}`)

    return new Response(JSON.stringify({
      success: true,
      active_tenant_id: tenant_id,
      tenants: tenantIds,
      is_super_admin: isSuperAdmin
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[set-active-tenant] Unexpected error:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
