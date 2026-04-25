/**
 * Cron job handlers — inlined from process-agent-updates + seed-collection-jobs
 * Phase 4: Cron job migration to gateways
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { isFeatureEnabled } from '../../_shared/feature-flags.ts';
import {
  SupabaseVersionQueryAdapter,
  SupabaseUpdateJobAdapter,
  SupabaseObservabilityAdapter,
  PersistingEventDispatcherAdapter,
  ProcessAgentUpdatesUseCase,
} from '../../_shared/hexagonal/index.ts';

type SB = any;

// ═══ sync:process-agent-updates ═══
export async function handleProcessAgentUpdates(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  logger.info(`[process-agent-updates][${requestId}] Cron job started`);

  const useCase = new ProcessAgentUpdatesUseCase(
    new SupabaseVersionQueryAdapter(supabase),
    new SupabaseUpdateJobAdapter(supabase),
    new SupabaseObservabilityAdapter(supabase),
    new PersistingEventDispatcherAdapter(supabase),
  );

  const result = await useCase.execute(requestId);

  if (result.platforms.length === 0) {
    return { message: 'No latest versions registered' };
  }

  try {
    await supabase.rpc('update_cron_health', {
      p_cron_name: 'process-agent-updates',
      p_success: true,
      p_details: { total_jobs_created: result.totalJobsCreated, platforms_processed: result.platforms.length },
    });
  } catch (_) { /* best effort */ }

  return {
    success: result.success,
    total_jobs_created: result.totalJobsCreated,
    platforms: result.platforms.map((p) => ({
      platform: p.platform, outdated_count: p.outdatedCount, jobs_created: p.jobsCreated,
    })),
  };
}

// ═══ sync:seed-collection-jobs ═══
interface CollectionJobTemplate {
  type: string;
  priority: number;
  ttl_hours: number;
  payload: Record<string, unknown>;
}

const COLLECTION_TEMPLATES: CollectionJobTemplate[] = [
  { type: 'collect_antivirus_status', priority: 5, ttl_hours: 1, payload: { source: 'auto-seed' } },
  { type: 'software_inventory_collect', priority: 3, ttl_hours: 2, payload: { source: 'auto-seed' } },
  { type: 'collect_network_info', priority: 4, ttl_hours: 1, payload: { source: 'auto-seed' } },
  { type: 'service_health_check', priority: 4, ttl_hours: 1, payload: { source: 'auto-seed' } },
  { type: 'light_vuln_scan', priority: 6, ttl_hours: 2, payload: { source: 'auto-seed', scan_level: 'light' } },
  { type: 'collect_certificates', priority: 3, ttl_hours: 1, payload: { source: 'auto-seed' } },
  { type: 'collect_web_activity', priority: 3, ttl_hours: 2, payload: { source: 'auto-seed', max_domains: 500 } },
  { type: 'collect_backup_status', priority: 3, ttl_hours: 2, payload: { source: 'auto-seed' } },
  { type: 'collect_process_lineage', priority: 4, ttl_hours: 2, payload: { source: 'auto-seed' } },
];

export async function handleSeedCollectionJobs(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const startedAt = Date.now();

  logger.info(`[${requestId}] [seed-collection-jobs] Starting`);

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: activeAgents, error: agentsError } = await supabase
    .from('agents')
    .select('id, agent_name, tenant_id, status, scheduling_paused, last_heartbeat')
    .eq('status', 'active')
    .eq('scheduling_paused', false)
    .gte('last_heartbeat', twoHoursAgo);

  if (agentsError) throw new Error(`Failed to fetch agents: ${agentsError.message}`);

  if (!activeAgents || activeAgents.length === 0) {
    logger.info(`[${requestId}] No active agents with recent heartbeat`);
    return { success: true, message: 'No active agents', jobs_created: 0 };
  }

  logger.info(`[${requestId}] Found ${activeAgents.length} active agents`);

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalSkippedFailRate = 0;
  let totalSkippedDisabled = 0;
  const agentResults: Array<{ agent: string; created: number; skipped: number; skipped_fail_rate: number }> = [];

  // Pre-check which job types are globally disabled via feature flags
  const disabledTypes = new Set<string>();
  for (const template of COLLECTION_TEMPLATES) {
    const flagKey = `JOB_TYPE_ENABLED_${template.type.toUpperCase()}`;
    const enabled = await isFeatureEnabled(supabase, flagKey, activeAgents[0]?.tenant_id);
    if (!enabled) {
      disabledTypes.add(template.type);
      logger.info(`[${requestId}] Job type '${template.type}' disabled via feature flag`);
    }
  }

  for (const agent of activeAgents) {
    let created = 0;
    let skipped = 0;
    let skippedFailRate = 0;

    for (const template of COLLECTION_TEMPLATES) {
      // Skip disabled job types
      if (disabledTypes.has(template.type)) {
        skipped++;
        totalSkippedDisabled++;
        continue;
      }

      // Check agent failure rate for this type
      try {
        const { data: failureCheck } = await supabase.rpc('check_agent_job_failure_rate', {
          p_agent_id: agent.id, p_job_type: template.type, p_days_back: 7, p_threshold: 50.0,
        });
        if (failureCheck && failureCheck.length > 0 && failureCheck[0].should_skip) {
          skippedFailRate++;
          totalSkippedFailRate++;
          continue;
        }
      } catch (_) { /* fail-open: proceed with job creation */ }

      try {
        const { data: jobId, error: createError } = await supabase.rpc('create_job_if_not_exists', {
          p_agent_id: agent.id, p_tenant_id: agent.tenant_id, p_type: template.type,
          p_payload: template.payload, p_priority: template.priority, p_ttl_hours: template.ttl_hours,
        });
        if (createError) { logger.error(`[${requestId}] Error creating ${template.type} for ${agent.agent_name}:`, createError.message); skipped++; continue; }
        if (jobId) { created++; } else { skipped++; }
      } catch (err) {
        logger.error(`[${requestId}] Exception creating ${template.type} for ${agent.agent_name}:`, err);
        skipped++;
      }
    }

    totalCreated += created;
    totalSkipped += skipped;
    agentResults.push({ agent: agent.agent_name, created, skipped, skipped_fail_rate: skippedFailRate });
  }

  const durationMs = Date.now() - startedAt;
  const result = { success: true, agents_processed: activeAgents.length, jobs_created: totalCreated, jobs_skipped_dedup: totalSkipped, jobs_skipped_failure_rate: totalSkippedFailRate, jobs_skipped_disabled: totalSkippedDisabled, agent_details: agentResults, duration_ms: durationMs };

  logger.info(`[${requestId}] [seed-collection-jobs] Done:`, JSON.stringify(result));

  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'seed-collection-jobs', p_success: true, p_duration_ms: durationMs,
      p_result: result, p_processed_count: totalCreated, p_job_source: 'cron',
    });
  } catch (e) { logger.warn('[seed-collection-jobs] Failed to log job run:', e); }

  return result;
}
