import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { corsHeaders } from '../_shared/error-handler.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

// Validation schema
const UpdateRoleSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  roles: z.array(z.enum(['admin', 'operator', 'viewer']))
    .min(1, 'At least one role is required')
    .max(3, 'Maximum of 3 roles')
    .refine((roles) => new Set(roles).size === roles.length, {
      message: 'Roles must be unique',
    }),
});

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

function createError(code: string, message: string, requestId: string, status: number): Response {
  const body: ErrorResponse = {
    error: { code, message, requestId },
  };
  
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return createError('UNAUTHORIZED', 'Authentication required', requestId, 401);
    }

    // Check if user is admin and get tenant
    const { data: actorRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError) {
      console.error('Error fetching actor role:', roleError);
      return createError('INTERNAL', 'Internal server error', requestId, 500);
    }

    if (!actorRole || actorRole.role !== 'admin') {
      // Audit failed attempt
      await supabaseAdmin.from('audit_logs').insert({
        tenant_id: actorRole?.tenant_id || null,
        user_id: user.id,
        action: 'update_role',
        resource_type: 'user',
        success: false,
        details: { reason: 'Insufficient permissions', actor_role: actorRole?.role },
        ip_address: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent'),
      });

      return createError('NOT_ALLOWED', 'Only admins can update user roles', requestId, 403);
    }

    const actorTenantId = actorRole.tenant_id;

    // Rate limiting: 10 req/min per tenant
    const rateLimitResult = await checkRateLimit(
      supabaseAdmin,
      `tenant:${actorTenantId}`,
      'update-user-role',
      { maxRequests: 10, windowMinutes: 1 }
    );

    if (!rateLimitResult.allowed) {
      return createError(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded. Try again after ${rateLimitResult.resetAt?.toISOString()}`,
        requestId,
        429
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validationResult = UpdateRoleSchema.safeParse(body);

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues.map(i => i.message).join(', ');
      return createError('BAD_REQUEST', errorMessage, requestId, 400);
    }

    const { userId, roles: newRoles } = validationResult.data;

    // Check if target user exists and is in the same tenant
    const { data: targetUserRole, error: targetError } = await supabaseAdmin
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (targetError) {
      console.error('Error fetching target user:', targetError);
      return createError('INTERNAL', 'Internal server error', requestId, 500);
    }

    if (!targetUserRole) {
      return createError('NOT_FOUND', 'User not found', requestId, 404);
    }

    if (targetUserRole.tenant_id !== actorTenantId) {
      return createError('NOT_ALLOWED', 'Cannot update users from different tenants', requestId, 403);
    }

    // Prevent admin from changing their own role
    if (userId === user.id) {
      return createError('BAD_REQUEST', 'Cannot change your own role', requestId, 400);
    }

    const currentRole = targetUserRole.role;

    // Idempotency check: if role hasn't changed, return early
    if (newRoles.length === 1 && newRoles[0] === currentRole) {
      return new Response(
        JSON.stringify({
          updated: false,
          message: 'Role unchanged',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // For this implementation, we assume only one role per user (matching current schema)
    // If you need multiple roles, you'd need to modify the user_roles table structure
    const newRole = newRoles[0];

    // Prevent removing the last admin
    if (currentRole === 'admin' && newRole !== 'admin') {
      const { count, error: countError } = await supabaseAdmin
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('tenant_id', actorTenantId);

      if (countError) {
        console.error('Error counting admins:', countError);
        return createError('INTERNAL', 'Internal server error', requestId, 500);
      }

      if (count === 1) {
        return createError(
          'BAD_REQUEST',
          'Cannot demote the last admin. Assign another admin first.',
          requestId,
          400
        );
      }
    }

    // Update user role
    const { error: updateError } = await supabaseAdmin
      .from('user_roles')
      .update({ role: newRole })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating role:', updateError);
      return createError('INTERNAL', 'Failed to update user role', requestId, 500);
    }

    // Create audit log with diff
    const diffJson = {
      before: { roles: [currentRole] },
      after: { roles: [newRole] },
    };

    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: actorTenantId,
      user_id: user.id,
      action: 'update_role',
      resource_type: 'user',
      resource_id: userId,
      success: true,
      details: diffJson,
      ip_address: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
    });

    return new Response(
      JSON.stringify({
        updated: true,
        message: 'User role updated successfully',
        data: {
          userId,
          previousRole: currentRole,
          newRole,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error in update-user-role:', error);
    
    return createError(
      'INTERNAL',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId,
      500
    );
  }
});
