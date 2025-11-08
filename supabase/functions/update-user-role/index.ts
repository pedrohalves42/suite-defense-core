import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createErrorResponse, ErrorCode, handleException, corsHeaders } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';

const UpdateRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['admin', 'operator', 'viewer']),
});

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
      return createErrorResponse(
        ErrorCode.UNAUTHORIZED,
        'Authentication required',
        401,
        requestId
      );
    }

    // Check if user is admin
    const { data: adminCheck, error: adminError } = await supabaseAdmin
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .single();

    if (adminError || adminCheck?.role !== 'admin') {
      await createAuditLog({
        supabase: supabaseAdmin,
        userId: user.id,
        action: 'update_user_role',
        resourceType: 'user_role',
        details: { reason: 'Insufficient permissions' },
        request: req,
        success: false,
      });

      return createErrorResponse(
        ErrorCode.FORBIDDEN,
        'Only admins can update user roles',
        403,
        requestId
      );
    }

    const adminTenantId = adminCheck.tenant_id;

    // Parse and validate request body
    const body = await req.json();
    const validatedData = UpdateRoleSchema.parse(body);

    // Check if target user exists and is in the same tenant
    const { data: targetUserRole, error: targetUserError } = await supabaseAdmin
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', validatedData.user_id)
      .single();

    if (targetUserError || !targetUserRole) {
      return createErrorResponse(
        ErrorCode.NOT_FOUND,
        'User not found',
        404,
        requestId
      );
    }

    if (targetUserRole.tenant_id !== adminTenantId) {
      return createErrorResponse(
        ErrorCode.FORBIDDEN,
        'Cannot update users from different tenants',
        403,
        requestId
      );
    }

    // Prevent admin from demoting themselves
    if (validatedData.user_id === user.id && validatedData.role !== 'admin') {
      return createErrorResponse(
        ErrorCode.BAD_REQUEST,
        'Cannot change your own role',
        400,
        requestId
      );
    }

    // If demoting the last admin, prevent it
    if (targetUserRole.role === 'admin' && validatedData.role !== 'admin') {
      const { count, error: countError } = await supabaseAdmin
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('tenant_id', adminTenantId);

      if (countError) {
        throw countError;
      }

      if (count === 1) {
        return createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'Cannot demote the last admin',
          400,
          requestId
        );
      }
    }

    // Update user role
    const { error: updateError } = await supabaseAdmin
      .from('user_roles')
      .update({ role: validatedData.role })
      .eq('user_id', validatedData.user_id);

    if (updateError) {
      throw updateError;
    }

    // Create audit log
    await createAuditLog({
      supabase: supabaseAdmin,
      userId: user.id,
      action: 'update_user_role',
      resourceType: 'user_role',
      resourceId: validatedData.user_id,
      details: {
        old_role: targetUserRole.role,
        new_role: validatedData.role,
      },
      request: req,
      success: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User role updated successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in update-user-role:', error);
    return handleException(error, requestId, 'update-user-role');
  }
});
