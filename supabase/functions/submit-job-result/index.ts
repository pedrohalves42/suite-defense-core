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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logSecurityEvent } from '../_shared/security-log.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'
import { sanitizeJobOutput, sanitizeErrorMessage } from '../_shared/sanitize.ts'
import { logger } from '../_shared/logger.ts'
import { requireEnv } from '../_shared/env.ts'

import type { SubmitContext, AuthenticatedAgentInfo, JobRecord } from './types.ts'
import { validateAndParsePayload, parseOutputData } from './validation.ts'
import { checkVersionGate, checkJobOwnership, checkExecutionIdRequired, checkPayloadTampering, checkDuplicateSubmission } from './security.ts'
import { processSideEffects } from './side-effects/index.ts'
import { finalizeExecution } from './execution.ts'
import { validateGovernance, validateUpdateAgentVersion, triggerAutoReport, analyzeBlockedAccess, processDnsBlockEvents } from './post-completion.ts'
import { buildCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest()
  const methodError = validateHttpMethod(req, ['POST'])
  if (methodError) return methodError

  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  )

  const traceId = req.headers.get('X-Trace-ID') || req.headers.get('X-Request-ID') || crypto.randomUUID();

  try {
    // ?? 1. Auth via X-Agent-Token ??
    const agentToken = req.headers.get('X-Agent-Token')
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    
    if (!agentToken) {
      await logSecurityEvent({ supabase, ipAddress, endpoint: '/submit-job-result', attackType: 'unauthorized', severity: 'medium', blocked: true, details: { reason: 'Missing X-Agent-Token' } })
      return new Response(JSON.stringify({ error: 'X-Agent-Token header required' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } })
    }

    const tokenHash = await hashToken(agentToken)
    const { data: token, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, tenant_id, hmac_secret)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .maybeSingle()

    if (tokenError || !token?.agents) {
      await logSecurityEvent({ supabase, ipAddress, endpoint: '/submit-job-result', attackType: 'unauthorized', severity: 'high', blocked: true, details: { token_prefix: agentToken.substring(0, 8) } })
      return new Response(JSON.stringify({ error: 'Invalid or inactive token' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } })
    }

    const agentRaw = Array.isArray(token.agents) ? token.agents[0] : token.agents
    const agent: AuthenticatedAgentInfo = {
      id: agentRaw.id,
      agent_name: agentRaw.agent_name,
      tenant_id: agentRaw.tenant_id,
      hmac_secret: agentRaw.hmac_secret,
    }

    // ?? 2. Fetch agent version for version gate ??
    const { data: agentData } = await supabase.from('agents').select('agent_version').eq('id', agent.id).single()
    const agentVersion = agentData?.agent_version || 'v0.0.0'

    // ?? 3. HMAC verification ??
    if (!agent.hmac_secret) {
      logger.error('[submit-job-result] CRITICAL: Agent without HMAC secret:', agent.agent_name)
      return new Response(JSON.stringify({ error: 'HMAC secret not configured for agent' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } })
    }

    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret, {
      agentId: agent.id, tenantId: agent.tenant_id, endpoint: '/submit-job-result', ip: ipAddress,
    })
    if (!hmacResult.valid) {
      logger.error('[submit-job-result] HMAC validation failed', { agent: agent.agent_name, error_code: hmacResult.errorCode })
      await logSecurityEvent({ supabase, tenantId: agent.tenant_id, ipAddress, endpoint: '/submit-job-result', attackType: 'unauthorized', severity: 'high', blocked: true, details: { agent_name: agent.agent_name, error_code: hmacResult.errorCode } })
      return new Response(JSON.stringify({ error: 'unauthorized', code: hmacResult.errorCode, message: hmacResult.errorMessage, transient: hmacResult.transient }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } })
    }

    // ?? 4. Rate limiting ??
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'submit-job-result', { maxRequests: 100, windowMinutes: 1, blockMinutes: 5 })
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded', resetAt: rateLimitResult.resetAt }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } })
    }

    // ?? 5. Parse & validate payload ??
    const rawPayload = await req.json()
    const validation = validateAndParsePayload(rawPayload)
    if (!validation.success) return validation.response
    const payload = validation.data

    // ?? 6. Fetch job ??
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, agent_name, tenant_id, status, type, agent_id, payload_hash, created_at')
      .eq('id', payload.job_id)
      .maybeSingle()

    if (fetchError) {
      logger.error('[submit-job-result] Database error fetching job', { job_id: payload.job_id, error: fetchError.message })
      return new Response(JSON.stringify({ error: 'Erro ao buscar job', details: fetchError.message }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } })
    }
    if (!job) {
      return new Response(JSON.stringify({ error: 'Job nao encontrado' }), { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } })
    }

    // ?? 7. Build context ??
    const outputData = parseOutputData(payload.output)
    const ctx: SubmitContext = {
      supabase, agent, agentVersion, job: job as JobRecord, payload, outputData, ipAddress,
      sideEffects: { inserted: false, recordCount: 0 },
    }

    // ?? 8. Security checks (sequential ? each can short-circuit) ??
    const versionGateErr = await checkVersionGate(ctx)
    if (versionGateErr) return versionGateErr

    const ownershipErr = await checkJobOwnership(ctx)
    if (ownershipErr) return ownershipErr

    const execIdErr = await checkExecutionIdRequired(ctx)
    if (execIdErr) return execIdErr

    const tamperErr = await checkPayloadTampering(ctx)
    if (tamperErr) return tamperErr

    const dupeErr = await checkDuplicateSubmission(ctx)
    if (dupeErr) return dupeErr

    // ?? 9. ZERO TRUST: Side effects BEFORE marking completed ??
    await processSideEffects(ctx)

    // ?? 10. Execution finalization (audit trail) ??
    const execResult = await finalizeExecution(ctx)

    // ?? 11. Update job ??
    const updateData: Record<string, unknown> = {
      status: payload.status,
      finished_at: payload.finished_at || new Date().toISOString(),
      completed_at: new Date().toISOString(),
      current_execution_id: null,
    }
    if (payload.started_at) updateData.started_at = payload.started_at
    if (payload.output !== undefined) updateData.output = sanitizeJobOutput(payload.output)
    if (payload.error_message) updateData.error_message = sanitizeErrorMessage(payload.error_message)
    if (payload.execution_time_seconds !== undefined) updateData.execution_time_seconds = payload.execution_time_seconds

    // ?? 12. Governance validation ??
    await validateGovernance(ctx, updateData)

    // Handle empty web activity
    if (job.type === 'collect_web_activity' && payload.status === 'completed' && !ctx.sideEffects.inserted) {
      updateData.status = 'completed'
      updateData.error_message = '[WARNING] Coleta web concluida sem historico disponivel no endpoint (sem DNS cache/browser history neste ciclo).'
    }

    // ?? 13. Persist job update ??
    const { data: updateResult, error: updateError } = await supabase.from('jobs').update(updateData).eq('id', payload.job_id).select()

    if (updateError) {
      const isIntegrityViolation = updateError.message?.includes('JOB_INTEGRITY_VIOLATION')
      logger.error('[submit-job-result] Database update failed', { job_id: payload.job_id, error: updateError.message, isIntegrityViolation, sideEffectsInserted: ctx.sideEffects.inserted })
      return new Response(
        JSON.stringify({ error: isIntegrityViolation ? 'Job integrity violation: missing side effects' : 'Erro ao atualizar job', details: updateError.message, code: isIntegrityViolation ? 'INTEGRITY_VIOLATION' : updateError.code }),
        { status: isIntegrityViolation ? 422 : 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    if (payload.status === 'completed') {
      logger.info('[JOB_INTEGRITY_OK]', { job_id: job.id, type: job.type, agent_id: job.agent_id, sideEffectsInserted: ctx.sideEffects.inserted, insertedRecordsCount: ctx.sideEffects.recordCount })
    }

    // ?? 14. Post-completion (non-blocking) ??
    await validateUpdateAgentVersion(ctx)
    await triggerAutoReport(ctx)
    await analyzeBlockedAccess(ctx)
    await processDnsBlockEvents(ctx)

    return new Response(
      JSON.stringify({ success: true, job_id: payload.job_id, execution_id: payload.execution_id || null, execution_finalized: execResult.executionFinalized, message: `Job marcado como ${payload.status}` }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return handleException(error, traceId, 'submit-job-result')
  }
})
