/**
 * Dead-Letter Queue (DLQ) utility for failed jobs
 * P2 Enhancement: Improved retry logic with exponential backoff
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logger } from './logger.ts';

export interface DLQEntry {
  original_job_id: string;
  tenant_id: string;
  agent_id?: string;
  agent_name: string;
  job_type: string;
  payload?: Record<string, unknown>;
  error_message: string;
  metadata?: Record<string, unknown>;
}

export interface DLQResult {
  success: boolean;
  dlqId?: string;
  error?: string;
  isNew?: boolean;
  retryScheduled?: boolean;
}

/**
 * Calculate next retry time with exponential backoff
 * P2 Enhancement: More aggressive initial retries, then longer delays
 * Delays: 30s, 2min, 10min, 30min, 1h
 */
export function calculateNextRetry(currentRetry: number): string {
  const delays = [30, 120, 600, 1800, 3600]; // seconds
  const delay = delays[Math.min(currentRetry, delays.length - 1)];
  const jitter = Math.floor(Math.random() * 10); // Add 0-10s jitter to prevent thundering herd
  return new Date(Date.now() + (delay + jitter) * 1000).toISOString();
}

/**
 * P2: Calculate retry priority based on job type and error count
 */
function calculatePriority(jobType: string, errorCount: number): number {
  const criticalJobs = ['update_agent', 'collect_antivirus_status', 'sync_blocked_websites'];
  const basePriority = criticalJobs.includes(jobType) ? 10 : 5;
  // Lower priority for jobs with many failures
  return Math.max(1, basePriority - Math.floor(errorCount / 2));
}

/**
 * Move a failed job to the Dead-Letter Queue
 * P2 Enhancement: Better logging, priority calculation, metadata tracking
 */
export async function moveToDeadLetterQueue(
  supabase: SupabaseClient,
  entry: DLQEntry
): Promise<DLQResult> {
  const startTime = Date.now();
  
  try {
    logger.info('[DLQ] Moving job to DLQ', { 
      job_id: entry.original_job_id,
      job_type: entry.job_type,
      agent: entry.agent_name 
    });

    // Check if already in DLQ
    const { data: existing, error: fetchError } = await supabase
      .from('failed_jobs_dlq')
      .select('id, error_count, retry_count, max_retries, metadata')
      .eq('original_job_id', entry.original_job_id)
      .maybeSingle();

    if (fetchError) {
      logger.error('[DLQ] Error checking existing entry', fetchError);
      return { success: false, error: fetchError.message };
    }

    if (existing) {
      // Update existing entry
      const newErrorCount = (existing.error_count || 1) + 1;
      const exhausted = (existing.retry_count || 0) >= (existing.max_retries || 3);
      
      // P2: Track error history in metadata
      const existingMetadata = existing.metadata as Record<string, unknown> || {};
      const errorHistory = (existingMetadata.error_history as string[]) || [];
      errorHistory.push(`${new Date().toISOString()}: ${entry.error_message}`);
      
      const updatedMetadata = {
        ...existingMetadata,
        ...entry.metadata,
        error_history: errorHistory.slice(-10), // Keep last 10 errors
        priority: calculatePriority(entry.job_type, newErrorCount),
        last_updated: new Date().toISOString(),
      };
      
      const { error: updateError } = await supabase
        .from('failed_jobs_dlq')
        .update({
          error_count: newErrorCount,
          last_failure_at: new Date().toISOString(),
          error_message: entry.error_message,
          status: exhausted ? 'exhausted' : 'pending',
          next_retry_at: exhausted ? null : calculateNextRetry(existing.retry_count || 0),
          metadata: updatedMetadata,
        })
        .eq('id', existing.id);

      if (updateError) {
        logger.error('[DLQ] Error updating entry', updateError);
        return { success: false, error: updateError.message };
      }

      const duration = Date.now() - startTime;
      logger.info('[DLQ] Updated existing entry', { 
        dlq_id: existing.id, 
        error_count: newErrorCount,
        exhausted,
        duration_ms: duration
      });
      
      return { 
        success: true, 
        dlqId: existing.id, 
        isNew: false,
        retryScheduled: !exhausted
      };
    } else {
      // Create new entry with P2 enhancements
      const { data: inserted, error: insertError } = await supabase
        .from('failed_jobs_dlq')
        .insert({
          original_job_id: entry.original_job_id,
          tenant_id: entry.tenant_id,
          agent_id: entry.agent_id,
          agent_name: entry.agent_name,
          job_type: entry.job_type,
          payload: entry.payload,
          error_message: entry.error_message,
          metadata: {
            ...entry.metadata,
            priority: calculatePriority(entry.job_type, 1),
            error_history: [`${new Date().toISOString()}: ${entry.error_message}`],
            created_at: new Date().toISOString(),
          },
          next_retry_at: calculateNextRetry(0),
        })
        .select('id')
        .single();

      if (insertError) {
        logger.error('[DLQ] Error inserting entry', insertError);
        return { success: false, error: insertError.message };
      }

      const duration = Date.now() - startTime;
      logger.info('[DLQ] Created new DLQ entry', { 
        dlq_id: inserted.id, 
        job_id: entry.original_job_id,
        duration_ms: duration
      });
      
      return { 
        success: true, 
        dlqId: inserted.id, 
        isNew: true,
        retryScheduled: true
      };
    }
  } catch (err) {
    logger.error('[DLQ] Unexpected error', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Mark a DLQ entry as resolved
 */
export async function resolveDLQEntry(
  supabase: SupabaseClient,
  dlqId: string,
  resolvedBy: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('failed_jobs_dlq')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_notes: notes,
    })
    .eq('id', dlqId);

  if (error) {
    logger.error('[DLQ] Error resolving entry', error);
    return { success: false, error: error.message };
  }

  logger.info('[DLQ] Entry resolved', { dlq_id: dlqId });
  return { success: true };
}

/**
 * Get DLQ entries ready for retry
 * P2 Enhancement: Order by priority and next_retry_at
 */
export async function getDLQEntriesForRetry(
  supabase: SupabaseClient,
  limit: number = 10
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('failed_jobs_dlq')
    .select('id, original_job_id, original_job_type, original_payload, tenant_id, agent_id, error_message, retry_count, max_retries, next_retry_at, status, priority, created_at')
    .eq('status', 'pending')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.error('[DLQ] Error fetching retry entries', error);
    return [];
  }

  logger.info('[DLQ] Found entries for retry', { count: data?.length ?? 0 });
  return data || [];
}

/**
 * P2: Get DLQ statistics for monitoring
 */
export async function getDLQStats(
  supabase: SupabaseClient,
  tenantId?: string
): Promise<{
  pending: number;
  retrying: number;
  exhausted: number;
  resolved: number;
  avgRetries: number;
}> {
  let query = supabase
    .from('failed_jobs_dlq')
    .select('status, retry_count');
  
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query;

  if (error || !data) {
    return { pending: 0, retrying: 0, exhausted: 0, resolved: 0, avgRetries: 0 };
  }

  const stats = data.reduce((acc, entry) => {
    acc[entry.status as keyof typeof acc] = (acc[entry.status as keyof typeof acc] || 0) + 1;
    acc.totalRetries += entry.retry_count || 0;
    return acc;
  }, { pending: 0, retrying: 0, exhausted: 0, resolved: 0, totalRetries: 0 });

  return {
    pending: stats.pending,
    retrying: stats.retrying,
    exhausted: stats.exhausted,
    resolved: stats.resolved,
    avgRetries: data.length > 0 ? stats.totalRetries / data.length : 0,
  };
}
