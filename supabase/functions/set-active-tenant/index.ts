import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * ADR-026: Atomic tenant switch endpoint
 * Uses switch_tenant_atomic RPC to eliminate race conditions between
 * access verification and metadata update
 */
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

    // ADR-026 FIX: Use atomic RPC to verify access AND collect tenant data in single transaction
    // This eliminates the race condition where access could be revoked between check and update
    const { data: switchResult, error: switchError } = await supabaseAdmin
      .rpc('switch_tenant_atomic', {
        p_user_id: user.id,
        p_new_tenant_id: tenant_id
      })

    if (switchError) {
      console.error('[set-active-tenant] Atomic switch RPC error:', switchError)
      return new Response(JSON.stringify({ error: 'Failed to verify tenant access' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if the RPC returned success
    if (!switchResult?.success) {
      const errorCode = switchResult?.error || 'TENANT_ACCESS_DENIED'
      const errorMessage = switchResult?.message || 'Tenant access denied'
      
      console.log(`[set-active-tenant] User ${user.id} denied: ${errorCode}`)
      
      // Handle concurrent modification - suggest retry
      if (errorCode === 'CONCURRENT_MODIFICATION') {
        return new Response(JSON.stringify({ 
          error: errorMessage,
          retry: true 
        }), {
          status: 409, // Conflict
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[set-active-tenant] Atomic verification passed, updating metadata`)

    // Get previous active tenant for audit
    const previousTenantId = user.app_metadata?.active_tenant_id

    // Update user's app_metadata with the atomically verified data
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          ...user.app_metadata,
          active_tenant_id: switchResult.active_tenant_id,
          tenants: switchResult.tenants,
          is_super_admin: switchResult.is_super_admin
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
            timestamp: new Date().toISOString(),
            atomic_switch: true // ADR-026: Mark as atomic switch
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
      active_tenant_id: switchResult.active_tenant_id,
      tenants: switchResult.tenants,
      is_super_admin: switchResult.is_super_admin,
      tenant_count: switchResult.tenant_count
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
