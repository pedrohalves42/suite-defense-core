/**
 * Payload validation and normalization for submit-job-result
 */

import { z } from 'https://esm.sh/zod@3.23.8'
import { logger } from '../_shared/logger.ts'
import type { ParsedPayload } from './types.ts'
import { buildCorsHeaders } from '../_shared/cors.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SubmitJobResultSchema = z.object({
  job_id: z.string().min(1, 'job_id is required'),
  status: z.enum(['completed', 'failed']),
  output: z.unknown().optional(),
  error_message: z.string().max(10000).nullable().optional(),
  execution_time_seconds: z.number().nonnegative().nullable().optional(),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  execution_id: z.string().nullable().optional(),
  nonce: z.string().max(256).nullable().optional(),
  result_signature: z.string().max(1024).nullable().optional(),
  signature_algorithm: z.string().max(64).nullable().optional(),
  execution_hash: z.string().max(256).nullable().optional(),
  previous_execution_hash: z.string().max(256).nullable().optional(),
  execution_index: z.number().int().nonnegative().nullable().optional(),
})

/**
 * Extracts and validates the payload from a raw request body.
 * Returns a validated ParsedPayload or an error Response.
 */
export function validateAndParsePayload(payload: Record<string, unknown>): 
  { success: true; data: ParsedPayload } | 
  { success: false; response: Response } {
  
  const parsed = SubmitJobResultSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...buildCorsHeaders(null), 'Content-Type': 'application/json' } }
      )
    }
  }

  const data = parsed.data

  // Warn if execution_time_seconds provided without timestamps
  if (data.execution_time_seconds != null && (!data.started_at || !data.finished_at)) {
    logger.warn('[submit-job-result] execution_time_seconds provided without timestamps', {
      job_id: data.job_id,
      execution_time_seconds: data.execution_time_seconds,
      has_started_at: !!data.started_at,
      has_finished_at: !!data.finished_at
    })
  }

  // Normalize execution_id: remove "exec-" prefix and validate UUID
  let execution_id: string | null = null
  const raw_execution_id = data.execution_id ?? null
  if (raw_execution_id && typeof raw_execution_id === 'string') {
    let normalized = raw_execution_id
    if (raw_execution_id.startsWith('exec-')) {
      normalized = raw_execution_id.substring(5)
      logger.debug('[submit-job-result] [P2.1] Normalized execution_id', {
        original: raw_execution_id,
        normalized
      })
    }
    if (UUID_REGEX.test(normalized)) {
      execution_id = normalized
    } else {
      logger.warn('[submit-job-result] [P2.1] execution_id is not a valid UUID after normalization', {
        original: raw_execution_id,
        normalized,
        job_id: data.job_id
      })
    }
  }

  return {
    success: true,
    data: {
      job_id: data.job_id,
      status: data.status,
      output: data.output,
      error_message: data.error_message ?? null,
      execution_time_seconds: data.execution_time_seconds ?? null,
      started_at: data.started_at ?? null,
      finished_at: data.finished_at ?? null,
      execution_id,
      raw_execution_id,
      nonce: data.nonce ?? null,
      result_signature: data.result_signature ?? null,
      signature_algorithm: data.signature_algorithm ?? null,
      execution_hash: data.execution_hash ?? null,
      previous_execution_hash: data.previous_execution_hash ?? null,
      execution_index: data.execution_index ?? null,
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
