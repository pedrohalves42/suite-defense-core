
import { servePublic } from '../_shared/serve-public.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  handleProcessFailedJobs, handleProcessScheduledJobs,
  handleInvokeScheduledJobs, handleDlqAction, handleProcessDlqRetries
} from './handlers/sync-jobs.ts';
import {
  handleFetchNvdCves, handleCorrelateEdrEvents, handleEvaluateEdrDetections
} from './handlers/edr-ops.ts';

const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

const INLINED_HANDLERS: Record<string, any> = {
  'sync:process-failed-jobs': handleProcessFailedJobs,
  'sync:process-scheduled-jobs': handleProcessScheduledJobs,
  'sync:invoke-scheduled-jobs': handleInvokeScheduledJobs,
  'sync:dlq-action': handleDlqAction,
  'sync:process-dlq-retries': handleProcessDlqRetries,
  'security:fetch-nvd-cves': handleFetchNvdCves,
  'security:correlate-edr-events': handleCorrelateEdrEvents,
  'security:evaluate-edr-detections': handleEvaluateEdrDetections,
};

servePublic(async (req, ctx) => {
  const { requestId, supabase, body } = ctx;
  const startedAt = Date.now();

  try {
    const authError = await assertInternalCaller(req, { requireSuperAdmin: true });
    if (authError) return authError;

    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) return { error: 'Invalid request', details: parsed.error.flatten().fieldErrors, __status: 400 };

    const { action, payload } = parsed.data;
    const handler = INLINED_HANDLERS[action];

    if (!handler) {
      return { error: `Unknown action in ops-sync: ${action}`, __status: 404 };
    }

    logger.info(`[ops-sync] Executing: ${action}`, { requestId });
    const result = await handler(supabase, requestId, payload, req);
    logger.info(`[ops-sync] ${action} done in ${Date.now() - startedAt}ms`);

    return result;
  } catch (err) {
    logger.error('[ops-sync] Error:', err);
    return { error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown', requestId, __status: 500 };
  }
});
