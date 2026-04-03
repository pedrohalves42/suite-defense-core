/**
 * ops-gateway — Unified Operations Gateway (Phase 5 + Phase 2C)
 *
 * Consolidates: check-router, sync-router, playbook-router, report-router, cleanup-router, notification-router
 *
 * Action format: "namespace:action" e.g. "check:check-stuck-jobs", "sync:process-failed-jobs"
 *
 * Auth: assertInternalCaller with allowAuthenticatedUsers
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

// Inlined handlers — check
import {
  handleCheckTaskSlaBreach, handleEvaluateJobSlo,
  handleCheckInstallationHealth, handleCheckProductionHealth,
  handleDetectBlockedAttempts,
  handleGetInstallationPipelineMetrics, handleCronSentinel,
  handleCheckStuckJobs, handleBuildWatchdog,
  handleCalculateBehavioralBaselines, handleComputeComplianceBenchmarks,
  handleCheckPendingAgents,
} from './handlers/check.ts';
import {
  handleMonitorThresholds, handleHealthMonitor,
  handleWatchdogNonExecution, handleCheckActionEffectiveness,
  handleAnalyzeJobFailurePatterns,
} from './handlers/check-monitors.ts';
// Inlined handlers — secret rotation compliance
import {
  handleSecretRotationCompliance, handleRecordSecretRotation,
} from './handlers/check-secrets.ts';

import {
  handleSliCollector, handleAnalyzeConfidenceGapTrend,
  handleAnalyzeNetworkAnomalies,
} from './handlers/check-analytics.ts';

// Inlined handlers — sync
import {
  handleResetDailyQuotas, handleLogDomainEvent,
  handleHmacCleanupScheduled, handleProcessTenantSuspensions,
  handleScheduledComplianceRefresh, handleFlushEventBuffer,
} from './handlers/sync.ts';
import { handleAutoTriageInsights } from './handlers/playbook.ts';

// Inlined handlers — sync jobs (Phase 3B)
import {
  handleProcessFailedJobs, handleProcessScheduledJobs, handleInvokeScheduledJobs,
  handleDlqAction, handleProcessDlqRetries,
} from './handlers/sync-jobs.ts';

// Inlined handlers — sync infra (Phase 3B)
import {
  handleSyncBlockedWebsites, handleMaintenanceCron, handleSystemMaintenance,
  handleReleaseSync, handleSyncStorageBucket, handleSyncStripeSubscriptions,
  handleSyncThreatFeeds,
} from './handlers/sync-infra.ts';

// Inlined handlers — honeypot cron (Phase 4)
import { handleCheckHoneypotAlerts, handleHoneypotDispatchAi } from './handlers/check-honeypot.ts';
import { handleCreateHoneypotPool } from './handlers/honeypot-pool.ts';
import { handleAiBehavioralAnomalyDetector } from './handlers/anomaly-ops.ts';
import { handleBlockWebsite } from './handlers/block-website.ts';

// Inlined handlers — playbook-core (Phase 1C)
import {
  handleExecutePlaybook, handleProcessPlaybookTriggerLogs,
  handleRollbackByDecisionEvent, handleRollbackRemediation,
  handleResolveActionPolicy,
} from './handlers/playbook-core.ts';

// Inlined handlers — playbook-automation (Phase 1C)
import {
  handleSoarEngine, handleAutoExecuteAiActions,
  handleOncallIntegration, handleCreateItsmTicket,
} from './handlers/playbook-automation.ts';

// Inlined handlers — playbook-analysis (Phase 1C)
import {
  handleCalculateRiskScore, handleRunAttackSimulation,
} from './handlers/playbook-analysis.ts';

// Inlined handlers — sync cron (Phase 4)
import { handleProcessAgentUpdates, handleSeedCollectionJobs } from './handlers/sync-cron.ts';

// Inlined handlers — security-ops (Phase 1A)
import {
  handleAutoQuarantine, handleQuarantineAgent, handleApplySecurityPatch,
  handleDetectBlockedAttemptsSecurity, handleSecurityMonitor,
  handleSecurityAlertDispatcher, handleIntegritySentinel,
  handlePopulateSecurityGraph, handlePublishThreatIoc,
} from './handlers/security-ops.ts';

// Inlined handlers — cleanup (Phase 3A)
import {
  handleCleanupTelemetry, handleCleanupStaleReports, handleCleanupStaleUpdates,
  handleCleanupStalePlaybooks, handleCleanupOfflineAgentsJobs, handleCleanupStuckBuilds,
  handleCleanupStuckJobs, handleAutoCleanupJobs, handleSecurityCleanup,
  handleCleanupJobs, handleCleanupExpiredEnrollmentKeys, handleCleanupOrphanedData,
  handleCleanupStaleHoneypots,
} from './handlers/cleanup.ts';

// Inlined handlers — notify (Phase 3A)
import {
  handleNotifyEmail, handleNotifyTelegram, handleNotifyWhatsApp,
  handleNotifyWebhook, handleNotifyWelcome, handleNotifySecurity,
  handleGetTelegramChatId,
} from './handlers/notify.ts';

const FETCH_TIMEOUT_MS = 45000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── Flat proxy map: "namespace:action" → target function ────────────────
const ACTION_TO_FUNCTION: Record<string, string> = {
  // playbook proxy targets (remaining — complex/standalone)
  'playbook:execute-playbook-action': 'execute-playbook-action',
  'playbook:evaluate-playbook-triggers': 'evaluate-playbook-triggers',
  'playbook:evaluate-automation-rules': 'evaluate-automation-rules',
  'playbook:auto-remediate': 'auto-remediate',
  'playbook:autonomous-safe-mode': 'autonomous-safe-mode',
  'playbook:evaluate-software-risk': 'evaluate-software-risk',
  // report proxy targets (all proxy)
  'report:compliance': 'generate-compliance-report',
  'report:executive': 'generate-executive-report',
  'report:explainable': 'generate-explainable-report',
  'report:security': 'generate-security-report',
  'report:weekly': 'generate-weekly-report',
  'report:auto': 'auto-generate-report',
  'report:scheduled': 'scheduled-report-generator',
  'report:list': 'list-reports',
};

// cleanup and notify are now fully inlined (Phase 3A) — no more router proxy

type InlinedHandler = (supabase: ReturnType<typeof createClient>, requestId: string, payload: Record<string, unknown>) => Promise<unknown>;

const INLINED_HANDLERS: Record<string, InlinedHandler> = {
  // ── check inlined (Phase 2C complete: 20 handlers) ──
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
  'check:sli-collector': handleSliCollector,
  'check:analyze-confidence-gap-trend': handleAnalyzeConfidenceGapTrend,
  'check:analyze-network-anomalies': handleAnalyzeNetworkAnomalies,
  // ── sync inlined ──
  'sync:reset-daily-quotas': handleResetDailyQuotas,
  'sync:log-domain-event': handleLogDomainEvent,
  'sync:hmac-cleanup-scheduled': handleHmacCleanupScheduled,
  'sync:process-tenant-suspensions': handleProcessTenantSuspensions,
  'sync:scheduled-compliance-refresh': handleScheduledComplianceRefresh,
  'sync:flush-event-buffer': handleFlushEventBuffer,
  // ── playbook inlined ──
  'playbook:auto-triage-insights': handleAutoTriageInsights,
  // ── sync inlined (Phase 3B) ──
  'sync:sync-blocked-websites': handleSyncBlockedWebsites,
  'sync:process-failed-jobs': handleProcessFailedJobs,
  'sync:process-scheduled-jobs': handleProcessScheduledJobs,
  'sync:invoke-scheduled-jobs': handleInvokeScheduledJobs,
  'sync:maintenance-cron': handleMaintenanceCron,
  'sync:system-maintenance': handleSystemMaintenance,
  'sync:dlq-action': handleDlqAction,
  'sync:process-dlq-retries': handleProcessDlqRetries,
  'sync:release-sync': handleReleaseSync,
  'sync:sync-storage-bucket': handleSyncStorageBucket,
  'sync:sync-stripe-subscriptions': handleSyncStripeSubscriptions,
  'sync:sync-threat-feeds': handleSyncThreatFeeds,
  // ── cleanup inlined (Phase 3A) ──
  'cleanup:telemetry': handleCleanupTelemetry,
  'cleanup:stale-reports': handleCleanupStaleReports,
  'cleanup:stale-updates': handleCleanupStaleUpdates,
  'cleanup:stale-playbooks': handleCleanupStalePlaybooks,
  'cleanup:offline-agents-jobs': handleCleanupOfflineAgentsJobs,
  'cleanup:stuck-builds': handleCleanupStuckBuilds,
  'cleanup:stuck-jobs': handleCleanupStuckJobs,
  'cleanup:auto-cleanup-jobs': handleAutoCleanupJobs,
  'cleanup:security': handleSecurityCleanup,
  'cleanup:jobs': handleCleanupJobs,
  'cleanup:expired-enrollment-keys': handleCleanupExpiredEnrollmentKeys,
  'cleanup:orphaned-data': handleCleanupOrphanedData,
  'cleanup:stale-honeypots': handleCleanupStaleHoneypots,
  // ── notify inlined (Phase 3A) ──
  'notify:email': handleNotifyEmail,
  'notify:telegram': handleNotifyTelegram,
  'notify:whatsapp': handleNotifyWhatsApp,
  'notify:webhook': handleNotifyWebhook,
  'notify:welcome': handleNotifyWelcome,
  'notify:security': handleNotifySecurity,
  'notify:get-telegram-chat-id': handleGetTelegramChatId,
  // ── honeypot cron inlined (Phase 4) ──
  'check:honeypot-alerts': handleCheckHoneypotAlerts,
  'check:honeypot-dispatch-ai': handleHoneypotDispatchAi,
  // ── sync cron inlined (Phase 4) ──
  'sync:process-agent-updates': handleProcessAgentUpdates,
  'sync:seed-collection-jobs': handleSeedCollectionJobs,
  // ── honeypot-pool + anomaly + block-website inlined (Phase 1B) ──
  'sync:create-honeypot-pool': handleCreateHoneypotPool,
  'check:ai-behavioral-anomaly-detector': handleAiBehavioralAnomalyDetector,
  'security:block-website': handleBlockWebsite,
  // ── secret rotation compliance (SOC 2) ──
  'check:secret-rotation-compliance': handleSecretRotationCompliance,
  'check:record-secret-rotation': handleRecordSecretRotation,
  // ── security-ops inlined (Phase 1A — serveInternal) ──
  'security:auto-quarantine': handleAutoQuarantine,
  'security:quarantine-agent': handleQuarantineAgent,
  'security:apply-security-patch': handleApplySecurityPatch,
  'security:detect-blocked-attempts': handleDetectBlockedAttemptsSecurity,
  'security:security-monitor': handleSecurityMonitor,
  'security:security-alert-dispatcher': handleSecurityAlertDispatcher,
  'security:integrity-sentinel': handleIntegritySentinel,
  'security:populate-security-graph': handlePopulateSecurityGraph,
  'security:publish-threat-ioc': handlePublishThreatIoc,
  // ── playbook inlined (Phase 1C) ──
  'playbook:execute-playbook': handleExecutePlaybook,
  'playbook:process-playbook-trigger-logs': handleProcessPlaybookTriggerLogs,
  'playbook:rollback-by-decision-event': handleRollbackByDecisionEvent,
  'playbook:rollback-remediation': handleRollbackRemediation,
  'playbook:resolve-action-policy': handleResolveActionPolicy,
  'playbook:soar-engine': handleSoarEngine,
  'playbook:auto-execute-ai-actions': handleAutoExecuteAiActions,
  'playbook:oncall-integration': handleOncallIntegration,
  'playbook:create-itsm-ticket': handleCreateItsmTicket,
  'playbook:calculate-risk-score': handleCalculateRiskScore,
  'playbook:run-attack-simulation': handleRunAttackSimulation,
};

const ALL_VALID_ACTIONS = new Set([
  ...Object.keys(ACTION_TO_FUNCTION),
  ...Object.keys(INLINED_HANDLERS),
]);


const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

const FORWARDED_HEADERS = [
  'Authorization', 'apikey', 'X-Internal-Secret', 'X-Agent-Token',
  'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce', 'x-cron-source',
];

function forwardHeaders(req: Request, requestId: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId, 'X-Trace-ID': requestId };
  for (const name of FORWARDED_HEADERS) {
    const v = req.headers.get(name);
    if (v) h[name] = v;
  }
  if (!h['Authorization']) {
    h['Authorization'] = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405, origin);

  const requestId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
    if (authError) return authError;

    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);

    const { action, payload } = parsed.data;

    // Parse namespace
    const colonIdx = action.indexOf(':');
    const namespace = colonIdx > 0 ? action.substring(0, colonIdx) : null;

    if (!namespace) {
      return jsonRes({
        error: `Missing namespace in action: "${action}". Use format "namespace:action".`,
        available_namespaces: ['check', 'sync', 'playbook', 'report', 'cleanup', 'notify', 'security'],
      }, 400, origin);
    }

    // Try inlined handler
    const inlinedHandler = INLINED_HANDLERS[action];
    if (inlinedHandler) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      logger.info(`[ops-gateway] Inline: ${action}`, { requestId });
      const result = await inlinedHandler(supabase, requestId, payload);
      logger.info(`[ops-gateway] ${action} done in ${Date.now() - startedAt}ms`);
      return jsonRes(result, 200, origin);
    }

    // Proxy to target function
    if (!ALL_VALID_ACTIONS.has(action)) {
      return jsonRes({
        error: `Unknown action: ${action}`,
        available_namespaces: ['check', 'sync', 'playbook', 'report', 'cleanup', 'notify', 'security'],
        hint: 'Use format "namespace:action", e.g. "check:check-stuck-jobs"',
      }, 400, origin);
    }

    const targetFn = ACTION_TO_FUNCTION[action];
    const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;
    logger.info(`[ops-gateway] Proxy: ${action} → ${targetFn}`, { requestId });

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: forwardHeaders(req, requestId),
      body: JSON.stringify(payload),
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    const responseData = await response.text();
    logger.info(`[ops-gateway] ${action} done in ${Date.now() - startedAt}ms (status: ${response.status})`);

    return new Response(responseData, {
      status: response.status,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });
  } catch (err) {
    logger.error('[ops-gateway] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown', requestId }, 500, origin);
  }
});
