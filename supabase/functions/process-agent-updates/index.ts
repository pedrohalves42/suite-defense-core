/**
 * process-agent-updates - Processes outdated agents and creates update jobs
 * Migrated to serveInternal middleware (with admin user support)
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import {
  SupabaseVersionQueryAdapter,
  SupabaseUpdateJobAdapter,
  SupabaseObservabilityAdapter,
  PersistingEventDispatcherAdapter,
  ProcessAgentUpdatesUseCase,
} from '../_shared/hexagonal/index.ts';

serveInternal(async (req, ctx) => {
  const { supabase, requestId } = ctx;

  // If called by a user (not cron), verify they are an admin
  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (authHeader.startsWith('Bearer ') && authHeader !== `Bearer ${serviceRoleKey}`) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'super_admin']);
    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    logger.info(`[process-agent-updates][${requestId}] Triggered by admin user`, { userId: user.id });
  }

  logger.info(`[process-agent-updates][${requestId}] Cron job started`);

  const useCase = new ProcessAgentUpdatesUseCase(
    new SupabaseVersionQueryAdapter(supabase),
    new SupabaseUpdateJobAdapter(supabase),
    new SupabaseObservabilityAdapter(supabase),
    new PersistingEventDispatcherAdapter(supabase),
  );

  const result = await useCase.execute(requestId);

  if (result.platforms.length === 0) {
    return { message: 'No latest versions registered' };
  }

  try {
    await supabase.rpc('update_cron_health', {
      p_cron_name: 'process-agent-updates',
      p_success: true,
      p_details: { total_jobs_created: result.totalJobsCreated, platforms_processed: result.platforms.length },
    });
  } catch (_) { /* best effort */ }

  return {
    success: result.success,
    total_jobs_created: result.totalJobsCreated,
    platforms: result.platforms.map((p) => ({
      platform: p.platform, outdated_count: p.outdatedCount, jobs_created: p.jobsCreated,
    })),
  };
});
