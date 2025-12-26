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
    // Autenticacao
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

    // Verificar usuario autenticado
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      logger.error('[cleanup-jobs] Authentication failed', { requestId, error: authError?.message });
      return new Response(
        JSON.stringify({ error: 'Unauthorized', requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se e admin
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

    // Build cutoff date
    const cutoffDate = new Date();
    if (older_than_days > 0) {
      cutoffDate.setDate(cutoffDate.getDate() - older_than_days);
    }

    // First, get IDs of jobs matching the criteria (to delete children first)
    let parentQuery = supabase
      .from('jobs')
      .select('id')
      .eq('tenant_id', userRole.tenant_id);

    if (status.length > 0) {
      parentQuery = parentQuery.in('status', status);
    }

    if (older_than_days > 0) {
      parentQuery = parentQuery.lt('created_at', cutoffDate.toISOString());
    }

    if (agent_name) {
      parentQuery = parentQuery.eq('agent_name', agent_name);
    }

    const { data: parentJobs, error: parentQueryError } = await parentQuery;

    if (parentQueryError) {
      logger.error('[cleanup-jobs] Query failed', { requestId, error: parentQueryError.message });
      return new Response(
        JSON.stringify({ error: 'Failed to query jobs', details: parentQueryError.message, requestId }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!parentJobs || parentJobs.length === 0) {
      logger.info('[cleanup-jobs] No jobs to delete', { requestId });
      return new Response(
        JSON.stringify({
          success: true,
          deleted_count: 0,
          filters: { status, older_than_days, agent_name },
          requestId
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parentIds = parentJobs.map(j => j.id);
    const BATCH_SIZE = 100; // Process in batches to avoid payload limits
    let totalDeleted = 0;

    logger.info('[cleanup-jobs] Starting batched deletion', {
      requestId,
      totalJobs: parentIds.length,
      batchSize: BATCH_SIZE
    });

    // Process in batches
    for (let i = 0; i < parentIds.length; i += BATCH_SIZE) {
      const batch = parentIds.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(parentIds.length / BATCH_SIZE);

      // Step 0.1: Delete job_executions for this batch (FK constraint)
      const { error: execDeleteError } = await supabase
        .from('job_executions')
        .delete()
        .in('job_id', batch);

      if (execDeleteError) {
        logger.warn('[cleanup-jobs] Failed to delete job executions in batch', { 
          requestId, 
          batchNum,
          error: execDeleteError.message 
        });
      }

      // Step 0.2: Delete generated_reports for this batch (FK constraint)
      const { error: reportsDeleteError } = await supabase
        .from('generated_reports')
        .delete()
        .in('job_id', batch);

      if (reportsDeleteError) {
        logger.warn('[cleanup-jobs] Failed to delete generated reports in batch', { 
          requestId, 
          batchNum,
          error: reportsDeleteError.message 
        });
      }

      // Step 1: Delete child jobs for this batch (jobs that reference these parents)
      const { error: childDeleteError } = await supabase
        .from('jobs')
        .delete()
        .in('parent_job_id', batch);

      if (childDeleteError) {
        logger.warn('[cleanup-jobs] Failed to delete child jobs in batch', { 
          requestId, 
          batchNum,
          error: childDeleteError.message 
        });
      }

      // Step 2: Delete the parent jobs in this batch
      const { data: deletedJobs, error: deleteError } = await supabase
        .from('jobs')
        .delete()
        .in('id', batch)
        .select('id');

      if (deleteError) {
        logger.error('[cleanup-jobs] Delete failed in batch', { 
          requestId, 
          batchNum,
          error: deleteError.message 
        });
        // Continue with next batch instead of failing completely
      } else {
        totalDeleted += deletedJobs?.length || 0;
        logger.info('[cleanup-jobs] Batch completed', {
          requestId,
          batchNum,
          totalBatches,
          batchDeleted: deletedJobs?.length || 0,
          runningTotal: totalDeleted
        });
      }
    }

    const deletedCount = totalDeleted;

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
