import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create client with user's JWT to get their identity
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { keyId } = await req.json();
    if (!keyId) {
      return new Response(JSON.stringify({ error: 'keyId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create admin client for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user's role and tenant
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .order('role', { ascending: true }); // admin < super_admin alphabetically

    // Pick the highest privilege role (super_admin > admin)
    const userRole = userRoles?.find(r => r.role === 'super_admin') || userRoles?.[0] || null;

    if (roleError || !userRole) {
      logger.error('Failed to get user role', { userId: user.id, error: roleError });
      return new Response(JSON.stringify({ error: 'User role not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only admins and super_admins can revoke keys
    if (!['admin', 'super_admin'].includes(userRole.role)) {
      logger.warn('Unauthorized revoke attempt', { userId: user.id, role: userRole.role });
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the enrollment key to verify tenant ownership
    const { data: key, error: keyError } = await supabase
      .from('enrollment_keys')
      .select('id, tenant_id, is_active, description')
      .eq('id', keyId)
      .single();

    if (keyError || !key) {
      logger.warn('Key not found', { keyId, error: keyError });
      return new Response(JSON.stringify({ error: 'Key not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify tenant ownership (super_admin can revoke any tenant's key)
    if (userRole.role !== 'super_admin' && key.tenant_id !== userRole.tenant_id) {
      logger.warn('Cross-tenant revoke attempt', { 
        userId: user.id, 
        userTenant: userRole.tenant_id, 
        keyTenant: key.tenant_id 
      });
      return new Response(JSON.stringify({ error: 'Access denied to this key' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!key.is_active) {
      return new Response(JSON.stringify({ error: 'Key is already revoked' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Revoke the key
    const { error: revokeError } = await supabase
      .from('enrollment_keys')
      .update({ is_active: false })
      .eq('id', keyId);

    if (revokeError) {
      logger.error('Failed to revoke key', { keyId, error: revokeError });
      return new Response(JSON.stringify({ error: 'Failed to revoke key' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      tenant_id: userRole.tenant_id,
      action: 'revoke_enrollment_key',
      resource_type: 'enrollment_key',
      resource_id: keyId,
      details: {
        key_description: key.description,
        revoked_at: new Date().toISOString(),
      },
      success: true,
    });

    logger.info('Key revoked successfully', { keyId, userId: user.id });

    return new Response(JSON.stringify({ success: true, keyId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error('Unexpected error', { error: error instanceof Error ? error.message : error });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
