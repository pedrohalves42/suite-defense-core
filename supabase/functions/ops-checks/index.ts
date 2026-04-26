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
import { BuildWatchdogUseCase } from './use-cases/build-watchdog.use-case.ts';
import { CalculateBehavioralBaselinesUseCase } from './use-cases/calculate-behavioral-baselines.use-case.ts';
import { ComputeComplianceBenchmarksUseCase } from './use-cases/compute-compliance-benchmarks.use-case.ts';
const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

servePublic(async (req, ctx) => {
  const { requestId, supabase, body } = ctx;
  const user = (ctx as any).user;
  const startedAt = Date.now();

  try {
    const authError = await assertInternalCaller(req, { 
      allowAuthenticatedUsers: true,
      requireSuperAdmin: true 
    });
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

    // Decomposed Use Cases
    if (action === 'check:monitor-thresholds') {
      return await new MonitorThresholdsUseCase(checkRepo).execute(requestId, payload);
    }
    if (action === 'check:health-monitor') {
      return await new HealthMonitorUseCase(checkRepo).execute(requestId, payload);
    }
    if (action === 'check:watchdog-non-execution') {
      return await new WatchdogNonExecutionUseCase(checkRepo).execute(requestId, payload);
    }
    if (action === 'check:check-action-effectiveness') {
      return await new CheckActionEffectivenessUseCase(checkRepo).execute(requestId, payload);
    }
    if (action === 'check:analyze-job-failure-patterns') {
      return await new AnalyzeJobFailurePatternsUseCase(checkRepo).execute(requestId, payload);
    }
    if (action === 'check:check-task-sla-breach') {
      return await new CheckTaskSlaBreachUseCase(checkRepo).execute(requestId);
    }
    if (action === 'check:evaluate-job-slo') {
      return await new EvaluateJobSloUseCase(checkRepo).execute(requestId);
    }
    if (action === 'check:check-installation-health') {
      return await new CheckInstallationHealthUseCase(checkRepo).execute(requestId);
    }
    if (action === 'check:detect-stuck-installations') {
      return await new DetectBlockedAttemptsUseCase(checkRepo).execute(requestId);
    }
    if (action === 'check:get-installation-pipeline-metrics') {
      return await new GetInstallationPipelineMetricsUseCase(checkRepo).execute(requestId, payload);
    }
    if (action === 'check:cron-sentinel') {
      return await new CronSentinelUseCase(checkRepo).execute(requestId);
    }
    if (action === 'check:check-stuck-jobs') {
      return await new CheckStuckJobsUseCase(checkRepo).execute(requestId);
    }
    if (action === 'check:check-pending-agents') {
      return await new CheckPendingAgentsUseCase(checkRepo).execute(requestId);
    }
    if (action === 'check:build-watchdog') {
      return await new BuildWatchdogUseCase(checkRepo).execute(requestId);
    }
    if (action === 'check:calculate-behavioral-baselines') {
      return await new CalculateBehavioralBaselinesUseCase(checkRepo).execute(requestId);
    }
    if (action === 'check:compute-compliance-benchmarks') {
      return await new ComputeComplianceBenchmarksUseCase(checkRepo).execute(requestId);
    }


    return { error: `Unknown action in ops-checks: ${action}`, __status: 404 };
  } catch (err) {
    logger.error('[ops-checks] Error:', err);
    return { error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown', requestId, __status: 500 };
  }
});

