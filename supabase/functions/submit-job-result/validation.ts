/**
 * Payload validation and normalization for submit-job-result
 */

import { logger } from '../_shared/logger.ts'
import { corsHeaders } from '../_shared/error-handler.ts'
import type { ParsedPayload } from './types.ts'
import { buildCorsHeaders } from '../_shared/cors.ts';

/**
 * Extracts and validates the payload from a raw request body.
 * Returns a validated ParsedPayload or an error Response.
 */
export function validateAndParsePayload(payload: Record<string, unknown>): 
  { success: true; data: ParsedPayload } | 
  { success: false; response: Response } {
  
  const job_id = payload.job_id
  const status = payload.status
  const output = payload.output
  const error_message = payload.error_message as string | null || null
  const execution_time_seconds = payload.execution_time_seconds as number | null ?? null
  const started_at = payload.started_at as string | null || null
  const finished_at = payload.finished_at as string | null || null
  const raw_execution_id = payload.execution_id as string | null || null
  const nonce = payload.nonce as string | null || null
  const result_signature = payload.result_signature as string | null || null
  const signature_algorithm = payload.signature_algorithm as string | null || null
  const execution_hash = payload.execution_hash as string | null || null
  const previous_execution_hash = payload.previous_execution_hash as string | null || null
  const execution_index = payload.execution_index as number | null ?? null

  // Validate job_id
  if (!job_id || typeof job_id !== 'string') {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Invalid payload: job_id required (string)' }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }
  }

  // Validate status
  if (!status || !['completed', 'failed'].includes(status as string)) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'status must be "completed" or "failed"' }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }
  }

  // Validate execution_time_seconds if provided
  if (execution_time_seconds !== undefined && execution_time_seconds !== null) {
    if (typeof execution_time_seconds !== 'number' || execution_time_seconds < 0) {
      return {
        success: false,
        response: new Response(
          JSON.stringify({ error: 'execution_time_seconds must be a positive number' }),
          { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!started_at || !finished_at) {
      logger.warn('[submit-job-result] execution_time_seconds provided without timestamps', {
        job_id,
        execution_time_seconds,
        has_started_at: !!started_at,
        has_finished_at: !!finished_at
      })
    }
  }

  // Normalize execution_id: remove "exec-" prefix
  let execution_id: string | null = null
  if (raw_execution_id && typeof raw_execution_id === 'string') {
    let normalized = raw_execution_id
    if (raw_execution_id.startsWith('exec-')) {
      normalized = raw_execution_id.substring(5)
      logger.debug('[submit-job-result] [P2.1] Normalized execution_id', {
        original: raw_execution_id,
        normalized
      })
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRegex.test(normalized)) {
      execution_id = normalized
    } else {
      logger.warn('[submit-job-result] [P2.1] execution_id is not a valid UUID after normalization', {
        original: raw_execution_id,
        normalized,
        job_id
      })
    }
  }

  return {
    success: true,
    data: {
      job_id: job_id as string,
      status: status as 'completed' | 'failed',
      output,
      error_message,
      execution_time_seconds,
      started_at,
      finished_at,
      execution_id,
      raw_execution_id,
      nonce,
      result_signature,
      signature_algorithm,
      execution_hash,
      previous_execution_hash,
      execution_index,
    }
  }
}

/**
 * Parse output into a Record for side-effect processing.
 */
export function parseOutputData(output: unknown): Record<string, unknown> {
  if (!output) return {}
  if (typeof output === 'object' && output !== null) {
    return output as Record<string, unknown>
  }
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output)
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>
      }
    } catch (parseErr) {
      logger.warn('[submit-job-result] Failed to parse output as JSON string', {
        output_preview: String(output).substring(0, 200),
        error: parseErr instanceof Error ? parseErr.message : 'Unknown error'
      })
    }
  }
  return {}
}
