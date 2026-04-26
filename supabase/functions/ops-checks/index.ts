// ops-checks/index.ts - Hexagonal Router with Legacy Fallback
import { servePublic } from '../_shared/serve-public.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { SupabaseCheckRepository } from '../_shared/hexagonal/repositories/check.repository.ts';
import { RunScheduledChecksUseCase } from '../_shared/hexagonal/use-cases/run-scheduled-checks.ts';
import { GetCheckStatusUseCase } from '../_shared/hexagonal/use-cases/get-check-status.ts';
import { AcknowledgeCheckAlertUseCase } from '../_shared/hexagonal/use-cases/acknowledge-check-alert.ts';
import { ToggleCheckActiveUseCase } from '../_shared/hexagonal/use-cases/toggle-check-active.ts';
import { RunCheckHealthUseCase } from '../_shared/hexagonal/use-cases/run-check-health.ts';

import { MonitorThresholdsUseCase } from './use-cases/monitor-thresholds.use-case.ts';
import { HealthMonitorUseCase } from './use-cases/health-monitor.use-case.ts';
import { WatchdogNonExecutionUseCase } from './use-cases/watchdog-non-execution.use-case.ts';
import { CheckActionEffectivenessUseCase } from './use-cases/check-action-effectiveness.use-case.ts';
import { AnalyzeJobFailurePatternsUseCase } from './use-cases/analyze-job-failure-patterns.use-case.ts';
import { CheckTaskSlaBreachUseCase } from './use-cases/check-task-sla-breach.use-case.ts';
import { EvaluateJobSloUseCase } from './use-cases/evaluate-job-slo.use-case.ts';
import { CheckInstallationHealthUseCase } from './use-cases/check-installation-health.use-case.ts';
import { DetectBlockedAttemptsUseCase } from './use-cases/detect-blocked-attempts.use-case.ts';
import { GetInstallationPipelineMetricsUseCase } from './use-cases/get-installation-pipeline-metrics.use-case.ts';
import { CronSentinelUseCase } from './use-cases/cron-sentinel.use-case.ts';
import { CheckStuckJobsUseCase } from './use-cases/check-stuck-jobs.use-case.ts';
import { CheckPendingAgentsUseCase } from './use-cases/check-pending-agents.use-case.ts';


servePublic(async (req, ctx) => {
  const { requestId, supabase, body } = ctx;
  const user = (ctx as any).user;
  const startedAt = Date.now();

  try {
    const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
    if (authError) return authError;

    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) return { error: 'Invalid request', details: parsed.error.flatten().fieldErrors, __status: 400 };

    const { action, payload } = parsed.data;

    // Hexagonal Routing
    const checkRepo = new SupabaseCheckRepository(supabase);

    // Use Case Routing (Prefered)
    if (action === 'check:run-scheduled') {
      return await new RunScheduledChecksUseCase(checkRepo).execute(requestId);
    }
    if (action === 'check:get-status') {
      return await new GetCheckStatusUseCase(checkRepo).execute(payload.check_id as string);
    }
    if (action === 'check:acknowledge-alert') {
      return await new AcknowledgeCheckAlertUseCase(checkRepo).execute(payload.alert_id as string, user?.id);
    }
    if (action === 'check:toggle-active') {
      return await new ToggleCheckActiveUseCase(checkRepo).execute(payload.check_id as string, payload.is_active as boolean);
    }
    if (action === 'check:check-production-health') {
      return await new RunCheckHealthUseCase(checkRepo).execute(requestId);
    }

    // Legacy Routing (Fallback)
    const handler = LEGACY_HANDLERS[action];
    if (!handler) {
      return { error: `Unknown action in ops-checks: ${action}`, __status: 404 };
    }

    logger.info(`[ops-checks] Executing Legacy: ${action}`, { requestId });
    const result = await handler(supabase, requestId, payload, req);
    logger.info(`[ops-checks] ${action} legacy done in ${Date.now() - startedAt}ms`);

    return result;
  } catch (err) {
    logger.error('[ops-checks] Error:', err);
    return { error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown', requestId, __status: 500 };
  }
});
