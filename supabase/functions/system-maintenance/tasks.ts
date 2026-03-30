/**
 * System Maintenance - Task Modules
 * Each task implements the TaskResult interface.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export interface TaskResult {
  task: string;
  processed: number;
  cleaned: number;
  errors: string[];
  duration_ms: number;
}

type SupabaseInstance = ReturnType<typeof createClient>;

export async function cleanStaleUpdates(supabase: SupabaseInstance): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'stale_updates', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };
  try {
    const MAX_DELIVERY_COUNT = 10;
    const MAX_STALE_HOURS = 168;
    const threshold = new Date(Date.now() - MAX_STALE_HOURS * 3600 * 1000).toISOString();
    const { data: byTime } = await supabase.from('agents').select('id').not('force_update_version', 'is', null).lt('force_update_at', threshold);
    const { data: byCount } = await supabase.from('agents').select('id').not('force_update_version', 'is', null).gte('force_update_delivery_count', MAX_DELIVERY_COUNT);
    const allIds = new Set([...(byTime || []).map((a: Record<string, unknown>) => a.id), ...(byCount || []).map((a: Record<string, unknown>) => a.id)]);
    result.processed = allIds.size;
    if (allIds.size > 0) {
      const { error } = await supabase.from('agents').update({ force_update_version: null, force_update_at: null, force_update_reason: null, force_update_delivery_count: 0 }).in('id', Array.from(allIds));
      if (error) result.errors.push(error.message);
      else result.cleaned = allIds.size;
    }
  } catch (e) { result.errors.push(String(e)); }
  result.duration_ms = Date.now() - start;
  return result;
}

export async function cleanStaleReports(supabase: SupabaseInstance): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'stale_reports', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };
  try {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase.from('security_reports').select('id').in('status', ['pending', 'processing', 'generated']).lt('created_at', cutoff);
    if (error) { result.errors.push(error.message); }
    else if (data && data.length > 0) {
      result.processed = data.length;
      const ids = data.map((r: Record<string, unknown>) => r.id);
      const { error: updateErr } = await supabase.from('security_reports').update({ status: 'failed', error_message: 'Stale report cleaned by system-maintenance' }).in('id', ids);
      if (updateErr) result.errors.push(updateErr.message);
      else result.cleaned = ids.length;
    }
  } catch (e) { result.errors.push(String(e)); }
  result.duration_ms = Date.now() - start;
  return result;
}

export async function cleanStalePlaybooks(supabase: SupabaseInstance): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'stale_playbooks', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from('playbook_executions').select('id').in('status', ['pending', 'in_progress']).lt('started_at', cutoff);
    if (error) { result.errors.push(error.message); }
    else if (data && data.length > 0) {
      result.processed = data.length;
      const ids = data.map((r: Record<string, unknown>) => r.id);
      const { error: updateErr } = await supabase.from('playbook_executions').update({ status: 'failed', completed_at: new Date().toISOString() }).in('id', ids);
      if (updateErr) result.errors.push(updateErr.message);
      else result.cleaned = ids.length;
    }
  } catch (e) { result.errors.push(String(e)); }
  result.duration_ms = Date.now() - start;
  return result;
}

export async function cleanStuckBuilds(supabase: SupabaseInstance): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'stuck_builds', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };
  try {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from('agent_builds').select('id').in('build_status', ['pending', 'building', 'in_progress']).lt('created_at', cutoff);
    if (error) { result.errors.push(error.message); }
    else if (data && data.length > 0) {
      result.processed = data.length;
      const ids = data.map((r: Record<string, unknown>) => r.id);
      const { error: updateErr } = await supabase.from('agent_builds').update({ build_status: 'failed', error_message: 'Build timed out - cleaned by system-maintenance' }).in('id', ids);
      if (updateErr) result.errors.push(updateErr.message);
      else result.cleaned = ids.length;
    }
  } catch (e) { result.errors.push(String(e)); }
  result.duration_ms = Date.now() - start;
  return result;
}

export async function cleanStuckJobs(supabase: SupabaseInstance): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'stuck_jobs', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };
  try {
    const cutoff = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
    const { data, error } = await supabase.from('jobs').select('id').in('status', ['pending', 'queued', 'delivered', 'running']).lt('created_at', cutoff);
    if (error) { result.errors.push(error.message); }
    else if (data && data.length > 0) {
      result.processed = data.length;
      const ids = data.map((r: Record<string, unknown>) => r.id);
      const { error: updateErr } = await supabase.from('jobs').update({ status: 'expired' }).in('id', ids);
      if (updateErr) result.errors.push(updateErr.message);
      else result.cleaned = ids.length;
    }
  } catch (e) { result.errors.push(String(e)); }
  result.duration_ms = Date.now() - start;
  return result;
}

export async function cleanOfflineAgentsJobs(supabase: SupabaseInstance): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'offline_agents_jobs', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };
  try {
    const offlineThreshold = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { data: offlineAgents } = await supabase.from('agents').select('id').lt('last_heartbeat', offlineThreshold);
    if (offlineAgents && offlineAgents.length > 0) {
      const agentIds = offlineAgents.map((a: Record<string, unknown>) => a.id);
      const { data: pendingJobs, error } = await supabase.from('jobs').select('id').in('agent_id', agentIds).in('status', ['pending', 'queued']);
      if (error) { result.errors.push(error.message); }
      else if (pendingJobs && pendingJobs.length > 0) {
        result.processed = pendingJobs.length;
        const ids = pendingJobs.map((j: Record<string, unknown>) => j.id);
        const { error: updateErr } = await supabase.from('jobs').update({ status: 'cancelled' }).in('id', ids);
        if (updateErr) result.errors.push(updateErr.message);
        else result.cleaned = ids.length;
      }
    }
  } catch (e) { result.errors.push(String(e)); }
  result.duration_ms = Date.now() - start;
  return result;
}

export async function securityCleanup(supabase: SupabaseInstance): Promise<TaskResult> {
  const start = Date.now();
  const result: TaskResult = { task: 'security_cleanup', processed: 0, cleaned: 0, errors: [], duration_ms: 0 };
  try {
    const { data, error } = await supabase.from('active_sessions').select('id').lt('expires_at', new Date().toISOString());
    if (error) { result.errors.push(error.message); }
    else if (data && data.length > 0) {
      result.processed = data.length;
      const { error: delErr } = await supabase.from('active_sessions').delete().lt('expires_at', new Date().toISOString());
      if (delErr) result.errors.push(delErr.message);
      else result.cleaned = data.length;
    }
  } catch (e) { result.errors.push(String(e)); }
  result.duration_ms = Date.now() - start;
  return result;
}
