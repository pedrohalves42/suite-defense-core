import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { handleException, handleValidationError, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';

const RemoveMemberSchema = z.object({
  member_id: z.string().uuid(),
});

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

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Nao autorizado', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { 
      global: { headers: { Authorization: authHeader } } 
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Nao autorizado', 401, requestId);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verificar se e admin ou super_admin
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'super_admin'])
      .limit(1)
      .maybeSingle();

    if (!callerRole) {
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Apenas admins podem remover membros', 403, requestId);
    }

    const body = await req.json();

    // Validar input
    const validation = RemoveMemberSchema.safeParse(body);
    if (!validation.success) {
      return handleValidationError(validation.error, requestId);
    }

    const { member_id } = validation.data;

    // Get admin's tenant using helper (handles multiple roles)
    const adminTenantId = await getTenantIdForUser(supabaseAdmin, user.id);

    if (!adminTenantId) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Tenant nao encontrado', 400, requestId);
    }

    // Buscar user_role a ser removido
    const { data: targetRole, error: targetError } = await supabaseAdmin
      .from('user_roles')
      .select('id, user_id, tenant_id, role')
      .eq('id', member_id)
      .maybeSingle();

    if (targetError || !targetRole) {
      return createErrorResponse(ErrorCode.NOT_FOUND, 'Membro nao encontrado', 404, requestId);
    }

    // Verificar se o membro pertence ao mesmo tenant
    if (targetRole.tenant_id !== adminTenantId) {
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Membro nao pertence ao seu tenant', 403, requestId);
    }

    // Nao permitir que o admin remova a si mesmo
    if (targetRole.user_id === user.id) {
      return createErrorResponse(ErrorCode.FORBIDDEN, 'Voce nao pode remover a si mesmo', 403, requestId);
    }

    // CRITICAL: Verificar se nao e o ultimo admin do tenant
    if (targetRole.role === 'admin') {
      const { count: adminCount, error: countError } = await supabaseAdmin
        .from('user_roles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', adminTenantId)
        .eq('role', 'admin');

      if (countError) throw countError;

      if ((adminCount ?? 0) <= 1) {
        return createErrorResponse(
          ErrorCode.FORBIDDEN, 
          'Nao e possivel remover o ultimo admin do tenant', 
          400, 
          requestId
        );
      }
    }

    // Buscar info do membro para audit log (antes de deletar)
    const { data: memberProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('user_id', targetRole.user_id)
      .maybeSingle();

    // Remover membro
    const { error: deleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('id', member_id);

    if (deleteError) throw deleteError;

    // Criar audit log
    await createAuditLog({
      supabase: supabaseAdmin,
      userId: user.id,
      tenantId: adminTenantId,
      action: 'member_removed',
      resourceType: 'user_role',
      resourceId: member_id,
      details: { 
        removed_user_id: targetRole.user_id,
        removed_user_name: memberProfile?.full_name || 'Unknown',
        removed_role: targetRole.role,
      },
      request: req,
      success: true,
    });

    console.log(`[remove-member] Member ${member_id} removed by ${user.id} from tenant ${adminTenantId}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Membro removido com sucesso',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleException(error, requestId, 'remove-member');
  }
});
