// @ts-nocheck
import { servePublic } from '../_shared/serve-public.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { handleComplianceReport, handleSecurityReport, handleExplainableReport } from './handlers/report-generators.ts';
import { handleExecutiveReport, handleWeeklyReport, handleAutoGenerateReport, handleScheduledReportGenerator } from './handlers/report-scheduled.ts';

const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

const INLINED_HANDLERS: Record<string, any> = {
  'report:compliance': handleComplianceReport,
  'report:executive': handleExecutiveReport,
  'report:explainable': handleExplainableReport,
  'report:security': handleSecurityReport,
  'report:weekly': handleWeeklyReport,
  'report:auto': handleAutoGenerateReport,
  'report:scheduled': handleScheduledReportGenerator,
};

servePublic(async (req, ctx) => {
  const { requestId, supabase, body } = ctx;
  const startedAt = Date.now();
  const origin = req.headers.get('origin');

  try {
    const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
    if (authError) return authError;

    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) return { error: 'Invalid request', details: parsed.error.flatten().fieldErrors, __status: 400 };

    const { action, payload } = parsed.data;
    const handler = INLINED_HANDLERS[action];

    if (!handler) {
      return { error: `Unknown action in ops-reports: ${action}`, __status: 404 };
    }

    logger.info(`[ops-reports] Executing: ${action}`, { requestId });
    const result = await handler(supabase, requestId, payload, req);
    logger.info(`[ops-reports] ${action} done in ${Date.now() - startedAt}ms`);

    return result;
  } catch (err) {
    logger.error('[ops-reports] Error:', err);
    return { error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown', requestId, __status: 500 };
  }
});
