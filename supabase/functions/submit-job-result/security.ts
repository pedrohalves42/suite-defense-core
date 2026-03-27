/**
 * Security checks for submit-job-result:
 * - Version gate
 * - Job ownership
 * - Cross-tenant check
 * - Payload tamper detection
 * - Duplicate submission
 * - V-203 execution_id requirement
 */

import { logger } from '../_shared/logger.ts'
import { logSecurityEvent } from '../_shared/security-log.ts'
import { corsHeaders } from '../_shared/error-handler.ts'
import type { SubmitContext } from './types.ts'

const MIN_SUPPORTED_VERSION = 'v4.0.9'
const TRANSITION_DATE = new Date('2026-01-19T00:00:00Z')

const compareVersions = (v1: string, v2: string): number => {
  const normalize = (v: string) => v.replace('v', '').split('.').map(Number)
  const [a, b] = [normalize(v1), normalize(v2)]
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0)
  }
  return 0
}

/**
 * SSA-023: Block agents with versions below minimum supported.
 */
export async function checkVersionGate(ctx: SubmitContext): Promise<Response | null> {
  if (compareVersions(ctx.agentVersion, MIN_SUPPORTED_VERSION) < 0) {
    logger.warn('[submit-job-result] SSA-023: Rejecting job from outdated agent', {
      agent: ctx.agent.agent_name,
      agentVersion: ctx.agentVersion,
      minRequired: MIN_SUPPORTED_VERSION
    })
    
    await logSecurityEvent({
      supabase: ctx.supabase,
      tenantId: ctx.agent.tenant_id,
      ipAddress: ctx.ipAddress,
      endpoint: '/submit-job-result',
      attackType: 'unauthorized',
      severity: 'medium',
      blocked: true,
      details: {
        reason: 'unsupported_version',
        agent_name: ctx.agent.agent_name,
        agent_version: ctx.agentVersion,
        min_required: MIN_SUPPORTED_VERSION,
        action: 'upgrade_required'
      }
    })
    
    return new Response(
      JSON.stringify({ 
        error: 'unsupported_version',
        min_required: MIN_SUPPORTED_VERSION,
        current: ctx.agentVersion,
        message: 'Agent version too old. Please update to continue submitting job results.'
      }),
      { status: 426, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  return null
}

/**
 * Validate job ownership and cross-tenant access.
 */
export async function checkJobOwnership(ctx: SubmitContext): Promise<Response | null> {
  const { agent, job, ipAddress, supabase, payload } = ctx

  // Job must belong to this agent
  if (job.agent_name !== agent.agent_name) {
    await logSecurityEvent({
      supabase,
      tenantId: agent.tenant_id,
      ipAddress,
      endpoint: '/submit-job-result',
      attackType: 'unauthorized',
      severity: 'high',
      blocked: true,
      details: {
        reason: 'Job ownership mismatch',
        job_id: payload.job_id,
        job_agent: job.agent_name,
        requesting_agent: agent.agent_name
      }
    })
    
    logger.error('[submit-job-result] Job ownership mismatch', {
      job_id: payload.job_id,
      job_agent: job.agent_name,
      requesting_agent: agent.agent_name
    })
    return new Response(
      JSON.stringify({ error: 'Este job nao pertence ao agente autenticado' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Cross-tenant check
  if (job.tenant_id !== agent.tenant_id) {
    await logSecurityEvent({
      supabase,
      tenantId: agent.tenant_id,
      ipAddress,
      endpoint: '/submit-job-result',
      attackType: 'unauthorized',
      severity: 'critical',
      blocked: true,
      details: {
        reason: 'Cross-tenant job access attempt',
        job_tenant: job.tenant_id,
        agent_tenant: agent.tenant_id,
        job_id: payload.job_id,
        agent_name: agent.agent_name
      }
    })
    
    logger.error('[submit-job-result] Cross-tenant access blocked', {
      job_id: payload.job_id,
      job_tenant: job.tenant_id,
      agent_tenant: agent.tenant_id
    })
    return new Response(
      JSON.stringify({
        error: 'Cross-tenant access denied',
        details: 'Job pertence a outra organizacao'
      }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return null
}

/**
 * V-203: Require execution_id for jobs created after transition date.
 */
export async function checkExecutionIdRequired(ctx: SubmitContext): Promise<Response | null> {
  const { payload, job, agent, ipAddress, supabase } = ctx
  
  const jobCreatedAt = new Date(job.created_at || 0)
  if (!payload.execution_id && jobCreatedAt > TRANSITION_DATE) {
    logger.error('[submit-job-result] [V-203] Missing execution_id for recent job', {
      job_id: payload.job_id,
      job_created_at: job.created_at,
      transition_date: TRANSITION_DATE.toISOString(),
      agent_name: agent.agent_name
    })
    
    await logSecurityEvent({
      supabase,
      tenantId: agent.tenant_id,
      ipAddress,
      endpoint: '/submit-job-result',
      attackType: 'invalid_input',
      severity: 'high',
      blocked: true,
      details: { 
        job_id: payload.job_id, 
        agent_name: agent.agent_name,
        job_created_at: job.created_at,
        reason: 'EXECUTION_ID_REQUIRED: Jobs created after transition require execution_id for audit trail'
      }
    })
    
    return new Response(
      JSON.stringify({ 
        error: 'EXECUTION_ID_REQUIRED',
        message: 'Jobs created after 2026-01-19 require execution_id for audit compliance'
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  return null
}

/**
 * Payload tamper detection: compare job payload_hash vs execution payload_hash.
 */
export async function checkPayloadTampering(ctx: SubmitContext): Promise<Response | null> {
  const { payload, job, agent, ipAddress, supabase } = ctx
  
  if (!payload.execution_id || !job.payload_hash) return null
  
  const { data: execution, error: execFetchError } = await supabase
    .from('job_executions')
    .select('payload_hash')
    .eq('id', payload.execution_id)
    .maybeSingle()
  
  if (execFetchError) {
    logger.error('[submit-job-result] [P1] Error fetching execution payload_hash', execFetchError)
    return null  // Don't block on fetch errors
  }
  
  if (execution?.payload_hash && job.payload_hash !== execution.payload_hash) {
    logger.error('[submit-job-result] [SECURITY] [P1] PAYLOAD_TAMPERED', {
      job_id: payload.job_id,
      execution_id: payload.execution_id,
      job_payload_hash: job.payload_hash,
      execution_payload_hash: execution.payload_hash,
      agent_name: agent.agent_name
    })
    
    await logSecurityEvent({
      supabase,
      tenantId: agent.tenant_id,
      ipAddress,
      endpoint: '/submit-job-result',
      attackType: 'payload_tampering',
      severity: 'critical',
      blocked: true,
      details: {
        job_id: payload.job_id,
        execution_id: payload.execution_id,
        agent_name: agent.agent_name,
        job_payload_hash: job.payload_hash,
        execution_payload_hash: execution.payload_hash,
        reason: 'Job payload hash does not match execution payload hash - possible tampering or corruption'
      }
    })
    
    return new Response(
      JSON.stringify({ 
        error: 'PAYLOAD_TAMPERED',
        message: 'Job payload integrity check failed'
      }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  
  if (execution?.payload_hash) {
    logger.debug('[submit-job-result] [P1] Payload integrity VERIFIED', {
      job_id: payload.job_id,
      execution_id: payload.execution_id,
      hash_match: true
    })
  }
  
  return null
}

/**
 * SSA-006: Block duplicate submissions.
 */
export async function checkDuplicateSubmission(ctx: SubmitContext): Promise<Response | null> {
  const { job, payload, agent, ipAddress, supabase } = ctx
  
  if (['done', 'completed', 'failed'].includes(job.status)) {
    logger.debug('[submit-job-result] Job already done - duplicate submission', payload.job_id)
    
    await logSecurityEvent({
      supabase,
      tenantId: agent.tenant_id,
      ipAddress,
      endpoint: '/submit-job-result',
      attackType: 'duplicate_job_submission',
      severity: 'low',
      blocked: false,
      details: {
        job_id: payload.job_id,
        job_status: job.status,
        agent_name: agent.agent_name,
        submitted_status: payload.status,
        note: 'Duplicate result submission - job already completed'
      }
    })
    
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Job ja estava concluido',
        job_id: payload.job_id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  
  return null
}
