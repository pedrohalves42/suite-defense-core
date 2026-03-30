/**
 * Simple RPC-based cleanup handlers (offline-agents-jobs, stuck-builds)
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

export async function handleCleanupOfflineAgentsJobs(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase.rpc('cleanup_offline_agents_jobs');
  if (error) {
    logger.error(`[${requestId}] [cleanup:offline-agents-jobs] Error:`, error);
    throw new Error(error.message);
  }
  const result = data?.[0] || { cleaned_count: 0, agent_ids: [], job_ids: [] };
  return { success: true, cleaned_count: result.cleaned_count, agent_ids: result.agent_ids || [], job_ids: result.job_ids || [] };
}

export async function handleCleanupStuckBuilds(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase.rpc('cleanup_stuck_builds');
  if (error) throw new Error(`Cleanup function failed: ${error.message}`);
  const result = Array.isArray(data) && data.length > 0 ? data[0] : { cleaned_count: 0, build_ids: [] };
  return { success: true, cleaned_count: result.cleaned_count || 0, build_ids: result.build_ids || [] };
}
