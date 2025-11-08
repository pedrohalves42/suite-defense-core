import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { handleException, handleValidationError, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';

const UpdateStatusSchema = z.object({
  user_id: z.string().uuid({ message: 'ID de usuário inválido' }),
  is_active: z.boolean({ message: 'Status deve ser booleano' }),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Não autorizado', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { 
      global: { headers: { Authorization: authHeader } } 
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Não autorizado', 401, requestId);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if user is admin
    const { data: hasAdminRole } = await supabaseAdmin.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });

    if (!hasAdminRole) {
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Acesso negado', 403, requestId);
    }

    const body = await req.json();
    const validation = UpdateStatusSchema.safeParse(body);
    
    if (!validation.success) {
      return handleValidationError(validation.error, requestId);
    }

    const { user_id, is_active } = validation.data;

    // Get user's tenant
    const { data: adminTenant } = await supabaseAdmin
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    // Verify target user is in same tenant
    const { data: targetUserRole } = await supabaseAdmin
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user_id)
      .single();

    if (!targetUserRole || targetUserRole.tenant_id !== adminTenant?.tenant_id) {
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Usuário não encontrado no seu tenant', 403, requestId);
    }

    // Prevent self-deactivation
    if (user_id === user.id) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Não é possível desativar sua própria conta', 400, requestId);
    }

    // Update user status using Admin API
    if (is_active) {
      // Unban user
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: 'none',
      });
      if (error) throw error;
    } else {
      // Ban user indefinitely
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: '876000h', // 100 years
      });
      if (error) throw error;
    }

    await createAuditLog({
      supabase: supabaseAdmin,
      userId: user.id,
      action: is_active ? 'user_activated' : 'user_deactivated',
      resourceType: 'user',
      resourceId: user_id,
      details: { target_user_id: user_id, is_active },
      request: req,
      success: true,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleException(error, requestId, 'update-user-status');
  }
});
