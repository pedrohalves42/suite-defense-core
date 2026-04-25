// @ts-nocheck
import { servePublic } from '../_shared/serve-public.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  handleCheckTaskSlaBreach, handleEvaluateJobSlo,
  handleCheckInstallationHealth, handleCheckProductionHealth,
  handleDetectBlockedAttempts, handleGetInstallationPipelineMetrics,
  handleCronSentinel, handleCheckStuckJobs, handleBuildWatchdog,
  handleCalculateBehavioralBaselines, handleComputeComplianceBenchmarks,
  handleCheckPendingAgents
} from './handlers/check.ts';
import {
  handleMonitorThresholds, handleHealthMonitor,
  handleWatchdogNonExecution, handleCheckActionEffectiveness,
  handleAnalyzeJobFailurePatterns
} from './handlers/check-monitors.ts';

const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

const INLINED_HANDLERS: Record<string, any> = {
  'check:check-task-sla-breach': handleCheckTaskSlaBreach,
  'check:evaluate-job-slo': handleEvaluateJobSlo,
  'check:check-installation-health': handleCheckInstallationHealth,
  'check:check-production-health': handleCheckProductionHealth,
  'check:detect-stuck-installations': handleDetectBlockedAttempts,
  'check:get-installation-pipeline-metrics': handleGetInstallationPipelineMetrics,
  'check:cron-sentinel': handleCronSentinel,
  'check:check-stuck-jobs': handleCheckStuckJobs,
  'check:build-watchdog': handleBuildWatchdog,
  'check:calculate-behavioral-baselines': handleCalculateBehavioralBaselines,
  'check:compute-compliance-benchmarks': handleComputeComplianceBenchmarks,
  'check:check-pending-agents': handleCheckPendingAgents,
  'check:monitor-thresholds': handleMonitorThresholds,
  'check:health-monitor': handleHealthMonitor,
  'check:watchdog-non-execution': handleWatchdogNonExecution,
  'check:check-action-effectiveness': handleCheckActionEffectiveness,
  'check:analyze-job-failure-patterns': handleAnalyzeJobFailurePatterns,
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
      return { error: `Unknown action in ops-checks: ${action}`, __status: 404 };
    }

    logger.info(`[ops-checks] Executing: ${action}`, { requestId });
    const result = await handler(supabase, requestId, payload, req);
    logger.info(`[ops-checks] ${action} done in ${Date.now() - startedAt}ms`);

    return result;
  } catch (err) {
    logger.error('[ops-checks] Error:', err);
    return { error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown', requestId, __status: 500 };
  }
});
