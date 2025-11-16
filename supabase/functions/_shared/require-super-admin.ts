import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from './cors.ts';

export interface SuperAdminAuthResult {
  success: boolean;
  userId?: string;
  error?: string;
  response?: Response;
}

/**
 * CRITICAL SECURITY: Middleware to validate super_admin role server-side
 * 
 * This middleware MUST be used on all Edge Functions that require super_admin privileges:
 * - Any route that shows data from multiple tenants
 * - Any route that modifies global configurations
 * - Any route under /super-admin/*
 * 
 * Usage:
 * ```typescript
 * const authResult = await requireSuperAdmin(req);
 * if (!authResult.success) {
 *   return authResult.response!;
 * }
 * // Continue with function logic, authResult.userId contains the authenticated super_admin user
 * ```
 */
export async function requireSuperAdmin(
  req: Request,
  requestId?: string
): Promise<SuperAdminAuthResult> {
  const logPrefix = requestId ? `[${requestId}]` : '';
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error(`${logPrefix} [SECURITY] Missing Supabase credentials`);
      return {
        success: false,
        error: 'Internal server configuration error',
        response: new Response(
          JSON.stringify({ error: 'Internal server configuration error' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        ),
      };
    }

    // Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn(`${logPrefix} [SECURITY] Missing Authorization header`);
      return {
        success: false,
        error: 'Unauthorized: Missing Authorization header',
        response: new Response(
          JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        ),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user with JWT
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.warn(`${logPrefix} [SECURITY] Authentication failed:`, authError?.message);
      return {
        success: false,
        error: 'Unauthorized: Invalid or expired token',
        response: new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        ),
      };
    }

    console.log(`${logPrefix} [AUTH] User authenticated: ${user.id}`);

    // CRITICAL: Validate super_admin role using RPC (bypasses RLS)
    const { data: isSuperAdmin, error: roleError } = await supabaseClient.rpc('is_super_admin', {
      _user_id: user.id,
    });

    if (roleError) {
      console.error(`${logPrefix} [SECURITY] Error checking super_admin role:`, roleError);
      return {
        success: false,
        error: 'Failed to verify permissions',
        response: new Response(
          JSON.stringify({ error: 'Failed to verify permissions' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        ),
      };
    }

    if (!isSuperAdmin) {
      console.warn(`${logPrefix} [SECURITY] Access denied: User ${user.id} is not super_admin`);
      return {
        success: false,
        error: 'Access denied: Super Admin privileges required',
        response: new Response(
          JSON.stringify({ 
            error: 'Access denied: Super Admin privileges required',
            message: 'This endpoint requires super_admin role. Contact your system administrator if you believe this is an error.'
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        ),
      };
    }

    console.log(`${logPrefix} [AUTH] Super admin verified: ${user.id}`);

    return {
      success: true,
      userId: user.id,
    };
  } catch (error) {
    console.error(`${logPrefix} [SECURITY] Unexpected error in requireSuperAdmin:`, error);
    return {
      success: false,
      error: 'Internal authentication error',
      response: new Response(
        JSON.stringify({ error: 'Internal authentication error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      ),
    };
  }
}
