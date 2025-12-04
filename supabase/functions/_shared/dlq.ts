/**
 * Dead-Letter Queue (DLQ) utility for failed jobs
 * Handles moving failed jobs to DLQ with exponential backoff
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface DLQEntry {
  original_job_id: string;
  tenant_id: string;
  agent_id?: string;
  agent_name: string;
  job_type: string;
  payload?: any;
  error_message: string;
  metadata?: any;
}

/**
 * Calculate next retry time with exponential backoff
 * Delays: 1min, 5min, 15min, 30min
 */
function calculateNextRetry(currentRetry: number): string {
  const delays = [60, 300, 900, 1800]; // seconds
  const delay = delays[Math.min(currentRetry, delays.length - 1)];
  return new Date(Date.now() + delay * 1000).toISOString();
}

/**
 * Move a failed job to the Dead-Letter Queue
 * If already exists, increments error count and updates retry schedule
 */
export async function moveToDeadLetterQueue(
  supabase: SupabaseClient,
  entry: DLQEntry
): Promise<{ success: boolean; dlqId?: string; error?: string }> {
  try {
    // Check if already in DLQ
    const { data: existing, error: fetchError } = await supabase
      .from('failed_jobs_dlq')
      .select('id, error_count, retry_count, max_retries')
      .eq('original_job_id', entry.original_job_id)
      .maybeSingle();

    if (fetchError) {
      console.error('[DLQ] Error checking existing entry:', fetchError);
      return { success: false, error: fetchError.message };
    }

    if (existing) {
      // Update existing entry
      const newErrorCount = (existing.error_count || 1) + 1;
      const exhausted = (existing.retry_count || 0) >= (existing.max_retries || 3);
      
      const { error: updateError } = await supabase
        .from('failed_jobs_dlq')
        .update({
          error_count: newErrorCount,
          last_failure_at: new Date().toISOString(),
          error_message: entry.error_message,
          status: exhausted ? 'exhausted' : 'pending',
          next_retry_at: exhausted ? null : calculateNextRetry(existing.retry_count || 0),
          metadata: entry.metadata || {},
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[DLQ] Error updating entry:', updateError);
        return { success: false, error: updateError.message };
      }

      console.log(`[DLQ] Updated existing entry ${existing.id}, error_count=${newErrorCount}`);
      return { success: true, dlqId: existing.id };
    } else {
      // Create new entry
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
          metadata: entry.metadata || {},
          next_retry_at: calculateNextRetry(0),
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[DLQ] Error inserting entry:', insertError);
        return { success: false, error: insertError.message };
      }

      console.log(`[DLQ] Created new entry ${inserted.id} for job ${entry.original_job_id}`);
      return { success: true, dlqId: inserted.id };
    }
  } catch (err) {
    console.error('[DLQ] Unexpected error:', err);
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
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Get DLQ entries ready for retry
 */
export async function getDLQEntriesForRetry(
  supabase: SupabaseClient,
  limit: number = 10
): Promise<any[]> {
  const { data, error } = await supabase
    .from('failed_jobs_dlq')
    .select('*')
    .eq('status', 'pending')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[DLQ] Error fetching retry entries:', error);
    return [];
  }

  return data || [];
}
