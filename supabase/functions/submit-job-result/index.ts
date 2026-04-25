// @ts-nocheck
/**
 * submit-job-result ? Orchestrator
 * 
 * Decomposed from 1,893-line monolith into modules:
 * - validation.ts: payload parsing & normalization
 * - security.ts: ownership, cross-tenant, tamper detection, version gate
 * - side-effects/: software inventory, web activity, antivirus, network, certs, disk
 * - execution.ts: audit trail finalization, signature verification
 * - post-completion.ts: governance, report triggers, blocked access analysis
 * 
 * ZERO TRUST: Side effects run BEFORE job is marked completed.
 */

import { handleException } from '../_shared/error-handler.ts'
import { logger } from '../_shared/logger.ts'
import { sanitizeJobOutput, sanitizeErrorMessage } from '../_shared/sanitize.ts'
import { buildCorsHeaders } from '../_shared/cors.ts';
import { serveAgent } from '../_shared/serve-agent.ts';

import type { SubmitContext, AuthenticatedAgentInfo, JobRecord } from './types.ts'
import { validateAndParsePayload, parseOutputData } from './validation.ts'
import { checkVersionGate, checkJobOwnership, checkExecutionIdRequired, checkPayloadTampering, checkDuplicateSubmission } from './security.ts'
import { processSideEffects } from './side-effects/index.ts'
import { finalizeExecution } from './execution.ts'
import { validateGovernance, validateUpdateAgentVersion, triggerAutoReport, analyzeBlockedAccess, processDnsBlockEvents } from './post-completion.ts'

serveAgent(async (req, ctx) => {
  const { requestId, supabase: supabaseAny, agentId, agentName, tenantId, agentData, body: rawPayload } = ctx;
  const traceId = requestId;
  const origin = req.headers.get("origin");
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  try {
    const supabase = supabaseAny;

    const agent: AuthenticatedAgentInfo = {
      id: agentId,
      agent_name: agentName,
      tenant_id: tenantId,
      hmac_secret: ctx.hmacSecret || '',
    };

    const agentVersion = (agentData.agent_version as string | null) || 'v0.0.0';

    // ?? 5. Parse & validate payload ??
    const validation = validateAndParsePayload(rawPayload as Record<string, unknown>);
    if (!validation.success) return (validation as { success: false; response: Response }).response;
    const payload = validation.data;

    // ?? 6. Fetch job ??
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, agent_name, tenant_id, status, type, agent_id, payload_hash, created_at')
      .eq('id', payload.job_id)
      .maybeSingle();

    if (fetchError) {
      logger.error('[submit-job-result] Database error fetching job', { job_id: payload.job_id, error: fetchError.message });
      return new Response(JSON.stringify({ error: 'Erro ao buscar job', details: fetchError.message }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    if (!job) {
      return new Response(JSON.stringify({ error: 'Job nao encontrado' }), { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // ?? 7. Build context ??
    const outputData = parseOutputData(payload.output);
    const submitCtx: SubmitContext = {
      supabase, agent, agentVersion, job: job as JobRecord, payload, outputData, ipAddress, origin,
      sideEffects: { inserted: false, recordCount: 0 },
    };

    // ?? 8. Security checks (sequential ? each can short-circuit) ??
    const versionGateErr = await checkVersionGate(submitCtx);
    if (versionGateErr) return versionGateErr;

    const ownershipErr = await checkJobOwnership(submitCtx);
    if (ownershipErr) return ownershipErr;

    const execIdErr = await checkExecutionIdRequired(submitCtx);
    if (execIdErr) return execIdErr;

    const tamperErr = await checkPayloadTampering(submitCtx);
    if (tamperErr) return tamperErr;

    const dupeErr = await checkDuplicateSubmission(submitCtx);
    if (dupeErr) return dupeErr;

    // ?? 9. ZERO TRUST: Side effects BEFORE marking completed ??
    await processSideEffects(submitCtx);

    // ?? 10. Execution finalization (audit trail) ??
    const execResult = await finalizeExecution(submitCtx);

    // ?? 11. Update job ??
    const updateData: Record<string, unknown> = {
      status: payload.status,
      finished_at: payload.finished_at || new Date().toISOString(),
      completed_at: new Date().toISOString(),
      current_execution_id: null,
    };
    if (payload.started_at) updateData.started_at = payload.started_at;
    if (payload.output !== undefined) updateData.output = sanitizeJobOutput(payload.output);
    if (payload.error_message) updateData.error_message = sanitizeErrorMessage(payload.error_message);
    if (payload.execution_time_seconds !== undefined) updateData.execution_time_seconds = payload.execution_time_seconds;

    // ?? 12. Governance validation ??
    await validateGovernance(submitCtx, updateData);

    // Handle empty web activity
    if (job.type === 'collect_web_activity' && payload.status === 'completed' && !submitCtx.sideEffects.inserted) {
      updateData.status = 'completed';
      updateData.error_message = '[WARNING] Coleta web concluida sem historico disponivel no endpoint (sem DNS cache/browser history neste ciclo).';
    }

    // ?? 13. Persist job update ??
    const { data: updateResult, error: updateError } = await supabase.from('jobs').update(updateData).eq('id', payload.job_id).select();

    if (updateError) {
      const isIntegrityViolation = updateError.message?.includes('JOB_INTEGRITY_VIOLATION');
      logger.error('[submit-job-result] Database update failed', { job_id: payload.job_id, error: updateError.message, isIntegrityViolation, sideEffectsInserted: submitCtx.sideEffects.inserted });
      return new Response(
        JSON.stringify({ error: isIntegrityViolation ? 'Job integrity violation: missing side effects' : 'Erro ao atualizar job', details: updateError.message, code: isIntegrityViolation ? 'INTEGRITY_VIOLATION' : updateError.code }),
        { status: isIntegrityViolation ? 422 : 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    if (payload.status === 'completed') {
      logger.info('[JOB_INTEGRITY_OK]', { job_id: job.id, type: job.type, agent_id: job.agent_id, sideEffectsInserted: submitCtx.sideEffects.inserted, insertedRecordsCount: submitCtx.sideEffects.recordCount });
    }

    // ?? 14. Post-completion (non-blocking) ??
    await validateUpdateAgentVersion(submitCtx);
    await triggerAutoReport(submitCtx);
    await analyzeBlockedAccess(submitCtx);
    await processDnsBlockEvents(submitCtx);

    return { success: true, job_id: payload.job_id, execution_id: payload.execution_id || null, execution_finalized: execResult.executionFinalized, message: `Job marcado como ${payload.status}` };

  } catch (error) {
    return handleException(error, traceId, 'submit-job-result');
  }
}, {
  extraAgentFields: ['agent_version'],
  hmacVerify: true,
  rateLimit: {
    endpoint: 'submit-job-result',
    maxRequests: 100,
    windowMinutes: 1,
    blockMinutes: 5,
  }
});