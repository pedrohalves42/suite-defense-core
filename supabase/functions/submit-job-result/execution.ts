/**
 * Execution finalization: output hash, signature verification, 
 * retroactive execution creation, finalize_job_execution RPC.
 */

import { logger } from '../_shared/logger.ts'
import { logSecurityEvent } from '../_shared/security-log.ts'
import { sanitizeErrorMessage } from '../_shared/sanitize.ts'
import { verifyResultSignature } from '../_shared/verify-result-signature.ts'
import type { SubmitContext } from './types.ts'

export interface ExecutionResult {
  executionFinalized: boolean;
  outputHash: string | null;
  signatureVerified: boolean;
  signatureVerificationDetails: Record<string, unknown>;
}

/**
 * Compute SHA-256 hash of the output.
 */
async function computeOutputHashFromString(output: unknown): Promise<string | null> {
  const outputString = output ? JSON.stringify(output) : null
  if (!outputString) return null
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(outputString))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Verify result signature if provided.
 */
async function verifySignature(ctx: SubmitContext, outputHash: string | null): Promise<{
  verified: boolean;
  details: Record<string, unknown>;
}> {
  const { supabase, agent, payload, ipAddress } = ctx
  const { result_signature, execution_id, nonce, execution_hash, signature_algorithm, job_id } = payload

  if (!result_signature) {
    if (result_signature === null && execution_id && nonce) {
      // No signature provided — skip
    }
    return { verified: false, details: {} }
  }

  if (!execution_id || !nonce) {
    logger.warn('[submit-job-result] [P1_SIGNATURE] Signature provided but missing context', {
      job_id,
      has_execution_id: !!execution_id,
      has_nonce: !!nonce
    })
    return { verified: false, details: { verified: false, error: 'Missing execution_id or nonce for signature verification' } }
  }

  try {
    const verifyResult = await verifyResultSignature(
      supabase,
      agent.id,
      {
        jobId: job_id,
        executionId: execution_id,
        nonce,
        outputHash: outputHash || '',
        status: payload.status,
        executionHash: execution_hash || ''
      },
      result_signature,
      signature_algorithm || 'ECDSA-P256-SHA256'
    )

    const details: Record<string, unknown> = {
      verified: verifyResult.valid,
      keyId: verifyResult.keyId,
      keyVersion: verifyResult.keyVersion,
      isCurrent: verifyResult.isCurrent,
      algorithm: verifyResult.algorithm,
      errorCode: verifyResult.errorCode,
      errorMessage: verifyResult.errorMessage
    }

    if (!verifyResult.valid) {
      logger.warn('[submit-job-result] [P1_SIGNATURE] Signature INVALID', {
        job_id,
        execution_id,
        errorCode: verifyResult.errorCode
      })
      
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'invalid_input',
        severity: 'high',
        blocked: false,
        details: {
          reason: 'invalid_result_signature',
          job_id,
          execution_id,
          agent_name: agent.agent_name,
          error_code: verifyResult.errorCode
        }
      })
    } else {
      logger.debug('[submit-job-result] [P1_SIGNATURE] Signature VERIFIED', {
        job_id,
        execution_id,
        keyVersion: verifyResult.keyVersion
      })
    }

    return { verified: verifyResult.valid, details }
  } catch (sigError) {
    logger.error('[submit-job-result] [P1_SIGNATURE] Verification error:', sigError)
    return {
      verified: false,
      details: { verified: false, error: sigError instanceof Error ? sigError.message : 'Unknown error' }
    }
  }
}

/**
 * Finalize execution record: either via RPC or retroactive creation.
 */
export async function finalizeExecution(ctx: SubmitContext): Promise<ExecutionResult> {
  const { supabase, agent, payload } = ctx
  const { execution_id, job_id, status, started_at, finished_at, error_message, 
          execution_time_seconds, result_signature, execution_hash, 
          previous_execution_hash, execution_index } = payload

  const outputHash = await computeOutputHashFromString(payload.output)
  const sigResult = await verifySignature(ctx, outputHash)
  
  let executionFinalized = false

  if (execution_id) {
    logger.debug('[submit-job-result] [AUDIT_TRAIL] Finalizing job execution', {
      job_id,
      execution_id,
      status,
      has_signature: !!result_signature,
      signature_verified: sigResult.verified,
      execution_hash: execution_hash || 'NOT_PROVIDED',
      execution_index: execution_index ?? 'NOT_PROVIDED'
    })
    
    const { data: execResult, error: execError } = await supabase
      .rpc('finalize_job_execution', {
        p_job_id: job_id,
        p_execution_id: execution_id,
        p_agent_id: agent.id,
        p_status: status,
        p_started_at: started_at || null,
        p_finished_at: finished_at || new Date().toISOString(),
        p_output_hash: outputHash,
        p_error_message: error_message ? sanitizeErrorMessage(error_message) : null,
        p_execution_time_seconds: execution_time_seconds || null,
        p_result_signature: result_signature || null,
        p_signature_verified: sigResult.verified,
        p_execution_hash: execution_hash || null,
        p_previous_execution_hash: previous_execution_hash || null,
        p_execution_index: execution_index ?? null
      })
    
    if (execError) {
      logger.error('[submit-job-result] [AUDIT_TRAIL] Error finalizing execution', {
        error: execError.message,
        execution_id,
        job_id,
        agent: agent.agent_name
      })
    } else if (execResult?.success) {
      executionFinalized = true
    } else if (execResult?.error) {
      logger.warn('[submit-job-result] [AUDIT_TRAIL] Execution finalization failed', {
        result: execResult,
        job_id,
        execution_id
      })
    }
  } else {
    // Backward compatibility: fallback lookup for execution
    logger.debug('[submit-job-result] [AUDIT_TRAIL] No execution_id provided, attempting fallback lookup')
    
    const { data: existingExecution } = await supabase
      .from('job_executions')
      .select('id')
      .eq('job_id', job_id)
      .eq('agent_id', agent.id)
      .in('status', ['running', 'claimed'])
      .order('claimed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    if (existingExecution?.id) {
      const { data: execResult, error: execError } = await supabase
        .rpc('finalize_job_execution', {
          p_job_id: job_id,
          p_execution_id: existingExecution.id,
          p_agent_id: agent.id,
          p_status: status,
          p_started_at: started_at || null,
          p_finished_at: finished_at || new Date().toISOString(),
          p_output_hash: outputHash,
          p_error_message: error_message ? sanitizeErrorMessage(error_message) : null,
          p_execution_time_seconds: execution_time_seconds || null,
          p_result_signature: null,
          p_signature_verified: false
        })
      
      if (!execError && execResult?.success) {
        executionFinalized = true
      }
    } else {
      // Create retroactive execution
      const retroNonce = crypto.randomUUID()
      const retroExecutionId = crypto.randomUUID()
      
      const { error: insertError } = await supabase
        .from('job_executions')
        .insert({
          id: retroExecutionId,
          job_id: job_id,
          agent_id: agent.id,
          tenant_id: agent.tenant_id,
          agent_version: ctx.agentVersion,
          agent_name: agent.agent_name,
          nonce: retroNonce,
          execution_index: 0,
          payload_hash: ctx.job.payload_hash,
          claimed_at: new Date().toISOString(),
          started_at: started_at || new Date().toISOString(),
          finished_at: finished_at || new Date().toISOString(),
          status: status,
          output_hash: outputHash,
          error_message: error_message ? sanitizeErrorMessage(error_message) : null,
          execution_time_seconds: execution_time_seconds || null
        })
      
      if (insertError) {
        logger.error('[submit-job-result] [AUDIT_TRAIL] Failed to create retroactive execution', insertError)
      } else {
        executionFinalized = true
        logger.debug('[submit-job-result] [AUDIT_TRAIL] Created retroactive execution', {
          execution_id: retroExecutionId,
          job_id
        })
      }
    }
  }

  return {
    executionFinalized,
    outputHash,
    signatureVerified: sigResult.verified,
    signatureVerificationDetails: sigResult.details,
  }
}
