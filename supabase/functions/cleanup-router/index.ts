import { servePublic } from '../_shared/serve-public.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { logger } from '../_shared/logger.ts';

const CleanupSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional(),
});

servePublic(async (req, ctx) => {
  const { body, supabase, requestId } = ctx;
  
  const parsed = CleanupSchema.safeParse(body);
  if (!parsed.success) {
    return { error: 'Invalid payload', details: parsed.error.flatten().fieldErrors, __status: 400 };
  }

  const { action } = parsed.data;

  // Security check: block SQL injection patterns in action
  const sqlPatterns = [/[;'"\\/]/, /(union|select|insert|update|delete|drop)/i, /(--|\*\/|\/\*)/];
  if (sqlPatterns.some(pattern => pattern.test(action))) {
    return { error: 'Malicious content detected', __status: 400 };
  }

  logger.info(`[cleanup-router] Running action: ${action}`, { requestId });

  if (action === 'cleanup:hmac-signatures') {
    const { error } = await supabase.rpc('cleanup_agent_hmac_signatures');
    if (error) {
      logger.error('[cleanup-router] HMAC signature cleanup failed', { error });
      return { error: 'Cleanup failed', details: error.message, __status: 500 };
    }
    return { message: 'HMAC signatures cleaned up successfully', action };
  }

  if (action === 'cleanup:stale-agents') {
    // Logic to archive agents offline for > 30 days
    const { data, error } = await supabase
      .from('agents')
      .update({ archived_at: new Date().toISOString(), archived_reason: 'Automatic cleanup: offline > 30 days' })
      .lt('last_heartbeat', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .is('archived_at', null);
      
    if (error) return { error: 'Stale agent cleanup failed', details: error.message, __status: 500 };
    return { message: 'Stale agents archived', count: data?.length || 0, action };
  }

  return { message: 'Action not implemented', action, __status: 404 };
});
