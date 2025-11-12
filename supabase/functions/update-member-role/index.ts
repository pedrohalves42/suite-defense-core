import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { handleException, handleValidationError, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';

const UpdateRoleSchema = z.object({
  user_role_id: z.string().uuid(),
  new_role: z.enum(['admin', 'operator', 'viewer']),
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
    
    // Verificar se é admin
    const { data: hasAdminRole, error: roleError } = await supabaseAdmin.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });

    if (roleError || !hasAdminRole) {
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Acesso negado', 403, requestId);
    }

    const body = await req.json();

    // Validar input
    const validation = UpdateRoleSchema.safeParse(body);
    if (!validation.success) {
      return handleValidationError(validation.error, requestId);
    }

    const { user_role_id, new_role } = validation.data;

    // Get admin's tenant using helper (handles multiple roles)
    const adminTenantId = await getTenantIdForUser(supabaseAdmin, user.id);

    if (!adminTenantId) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Tenant não encontrado', 400, requestId);
    }

    // Buscar user_role a ser atualizado
    const { data: targetRole, error: targetError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, tenant_id, role')
      .eq('id', user_role_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (targetError || !targetRole) {
      return createErrorResponse(ErrorCode.NOT_FOUND, 'Membro não encontrado', 404, requestId);
    }

    // Verificar se o membro pertence ao mesmo tenant
    if (targetRole.tenant_id !== adminTenantId) {
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Membro não pertence ao seu tenant', 403, requestId);
    }

    // Não permitir que o admin altere seu próprio role
    if (targetRole.user_id === user.id) {
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Você não pode alterar seu próprio role', 403, requestId);
    }

    // Atualizar role
    const { error: updateError } = await supabaseAdmin
      .from('user_roles')
      .update({ role: new_role })
      .eq('id', user_role_id);

    if (updateError) throw updateError;

    await createAuditLog({
      supabase: supabaseAdmin,
      userId: user.id,
      tenantId: adminTenantId,
      action: 'member_role_updated',
      resourceType: 'user_role',
      resourceId: user_role_id,
      details: { 
        target_user_id: targetRole.user_id,
        old_role: targetRole.role, 
        new_role 
      },
      request: req,
      success: true,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleException(error, requestId, 'update-member-role');
  }
});
