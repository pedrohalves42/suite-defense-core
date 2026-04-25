// @ts-nocheck
import { servePublic } from '../_shared/serve-public.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  handleExecutePlaybook, handleProcessPlaybookTriggerLogs,
  handleRollbackByDecisionEvent, handleRollbackRemediation,
  handleResolveActionPolicy
} from './handlers/playbook-core.ts';
import {
  handleSoarEngine, handleAutoExecuteAiActions,
  handleOncallIntegration, handleCreateItsmTicket
} from './handlers/playbook-automation.ts';

const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

const INLINED_HANDLERS: Record<string, any> = {
  'playbook:execute-playbook': handleExecutePlaybook,
  'playbook:process-playbook-trigger-logs': handleProcessPlaybookTriggerLogs,
  'playbook:rollback-by-decision-event': handleRollbackByDecisionEvent,
  'playbook:rollback-remediation': handleRollbackRemediation,
  'playbook:resolve-action-policy': handleResolveActionPolicy,
  'playbook:soar-engine': handleSoarEngine,
  'playbook:auto-execute-ai-actions': handleAutoExecuteAiActions,
  'playbook:oncall-integration': handleOncallIntegration,
  'playbook:create-itsm-ticket': handleCreateItsmTicket,
};

servePublic(async (req, ctx) => {
  const { requestId, supabase, body } = ctx;
  const startedAt = Date.now();

  try {
    const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
    if (authError) return authError;

    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) return { error: 'Invalid request', details: parsed.error.flatten().fieldErrors, __status: 400 };

    const { action, payload } = parsed.data;
    const handler = INLINED_HANDLERS[action];

    if (!handler) {
      return { error: `Unknown action in ops-playbook: ${action}`, __status: 404 };
    }

    logger.info(`[ops-playbook] Executing: ${action}`, { requestId });
    const result = await handler(supabase, requestId, payload, req);
    logger.info(`[ops-playbook] ${action} done in ${Date.now() - startedAt}ms`);

    return result;
  } catch (err) {
    logger.error('[ops-playbook] Error:', err);
    return { error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown', requestId, __status: 500 };
  }
});
