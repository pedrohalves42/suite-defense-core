import type { PlaybookAction, ActionContext } from './types.ts';
import { handleNotify } from './handlers/notify.ts';
import {
  handleIsolate,
  handleCreateJob,
  handleKillProcess,
  handleStopService,
  handleDisableService,
  handleRestartService,
} from './handlers/agent-jobs.ts';
import {
  handleRevokeToken,
  handleEscalate,
  handleGenerateReport,
} from './handlers/security.ts';

const ACTION_HANDLERS: Record<
  string,
  (action: PlaybookAction, ctx: ActionContext) => Promise<Record<string, unknown>>
> = {
  notify: handleNotify,
  isolate: handleIsolate,
  isolate_agent: handleIsolate,
  generate_report: handleGenerateReport,
  create_job: handleCreateJob,
  revoke_token: handleRevokeToken,
  escalate: handleEscalate,
  kill_process: handleKillProcess,
  stop_service: handleStopService,
  disable_service: handleDisableService,
  restart_service: handleRestartService,
};

export async function executeAction(
  action: PlaybookAction,
  ctx: ActionContext
): Promise<Record<string, unknown>> {
  const handler = ACTION_HANDLERS[action.action_type];
  if (!handler) {
    throw new Error(`Unknown action type: ${action.action_type}`);
  }
  return handler(action, ctx);
}
