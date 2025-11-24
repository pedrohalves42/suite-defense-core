import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

interface CleanupRequest {
  status?: string[];
  older_than_days?: number;
  agent_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  
  try {
    // Autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing token', requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar usuário autenticado
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      logger.error('[cleanup-jobs] Authentication failed', { requestId, error: authError?.message });
      return new Response(
        JSON.stringify({ error: 'Unauthorized', requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se é admin
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      logger.error('[cleanup-jobs] Insufficient permissions', { requestId, userId: user.id });
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required', requestId }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: CleanupRequest = await req.json();
    const { status = ['failed', 'delivered'], older_than_days = 7, agent_name } = body;

    logger.info('[cleanup-jobs] Cleanup requested', {
      requestId,
      userId: user.id,
      tenantId: userRole.tenant_id,
      status,
      older_than_days,
      agent_name
    });

    // Build query
    let query = supabase
      .from('jobs')
      .delete()
      .eq('tenant_id', userRole.tenant_id);

    // Apply filters
    if (status.length > 0) {
      query = query.in('status', status);
    }

    if (older_than_days > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - older_than_days);
      query = query.lt('created_at', cutoffDate.toISOString());
    }

    if (agent_name) {
      query = query.eq('agent_name', agent_name);
    }

    // Execute deletion
    const { data: deletedJobs, error: deleteError } = await query.select('id');

    if (deleteError) {
      logger.error('[cleanup-jobs] Delete failed', { requestId, error: deleteError.message });
      return new Response(
        JSON.stringify({ error: 'Failed to delete jobs', details: deleteError.message, requestId }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const deletedCount = deletedJobs?.length || 0;

    logger.success('[cleanup-jobs] Cleanup completed', {
      requestId,
      deletedCount,
      tenantId: userRole.tenant_id
    });

    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: deletedCount,
        filters: { status, older_than_days, agent_name },
        requestId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[cleanup-jobs] Unexpected error', { requestId, error: errorMessage });
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: errorMessage,
        requestId 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
