/**
 * Hexagonal Use Case: Run Maintenance
 * 
 * Domain logic for maintenance operations: expiring stale jobs
 * and archiving old executions.
 * 
 * CRITICAL: Auto-archiving/inactivating agents is FORBIDDEN.
 * Agents powered off overnight or weekends must NOT be deactivated.
 * See memory: agent/status-thresholds-and-logic
 */

import { logger } from '../../logger.ts';

export interface MaintenanceResult {
  expiredJobsProcessed: number;
  archivedExecutions: number;
  staleForceFlagsCleaned: number;
  durationMs: number;
}

interface SupabaseClient {
  from(table: string): any;
  rpc(fn: string, params: Record<string, unknown>): any;
}

export class RunMaintenanceUseCase {
  constructor(private readonly supabase: SupabaseClient) {}

  async execute(): Promise<MaintenanceResult> {
    const startedAt = Date.now();
    const now = new Date();

    const [expiredJobs, archivedExecs, staleFlagsClean] = await Promise.all([
      this.expireJobs(now),
      this.archiveOldExecutions(now),
      this.cleanStaleForceUpdateFlags(now),
    ]);

    const durationMs = Date.now() - startedAt;

    // Report cron health
    try {
      await this.supabase.rpc('update_cron_health', {
        p_cron_name: 'maintenance-cron',
        p_success: true,
        p_details: {
          expired_jobs_processed: expiredJobs,
          archived_executions: archivedExecs,
          stale_force_flags_cleaned: staleFlagsClean,
          duration_ms: durationMs,
        },
      });
    } catch (err) {
      logger.warn('[RunMaintenance] Failed to update cron health', { error: err });
    }

    return {
      expiredJobsProcessed: expiredJobs,
      archivedExecutions: archivedExecs,
      staleForceFlagsCleaned: staleFlagsClean,
      durationMs,
    };
  }

  /**
   * Expire jobs that have passed their TTL.
   */
  private async expireJobs(now: Date): Promise<number> {
    const { data: expiredJobs } = await this.supabase
      .from('jobs')
      .select('id')
      .in('status', ['pending', 'queued', 'delivered', 'running'])
      .lt('expires_at', now.toISOString())
      .limit(500);

    if (!expiredJobs?.length) return 0;

    const ids = expiredJobs.map((j: { id: string }) => j.id);
    const { error } = await this.supabase
      .from('jobs')
      .update({ status: 'timeout', updated_at: now.toISOString() })
      .in('id', ids);

    if (error) {
      logger.error('[RunMaintenance] Failed to expire jobs', { error: error.message });
      return 0;
    }

    logger.info(`[RunMaintenance] Expired ${ids.length} jobs past TTL`);
    return ids.length;
  }

  /**
   * Archive old job executions (>30 days).
   */
  private async archiveOldExecutions(now: Date): Promise<number> {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: oldExecutions } = await this.supabase
      .from('job_executions')
      .select('id')
      .is('archived_at', null)
      .lt('created_at', thirtyDaysAgo)
      .limit(1000);

    if (!oldExecutions?.length) return 0;

    const ids = oldExecutions.map((e: { id: string }) => e.id);
    const { error } = await this.supabase
      .from('job_executions')
      .update({ archived_at: now.toISOString() })
      .in('id', ids);

    if (error) {
      logger.error('[RunMaintenance] Failed to archive executions', { error: error.message });
      return 0;
    }

    logger.info(`[RunMaintenance] Archived ${ids.length} old executions`);
    return ids.length;
  }

  /**
   * Clean stale force_update flags for agents that have been
   * delivered 50+ times without updating (STUCK state).
   * Also cleans force_update flags pointing to non-existent releases.
   */
  private async cleanStaleForceUpdateFlags(now: Date): Promise<number> {
    // Clean agents with non-existent force_update versions
    const { data: agentsWithForce } = await this.supabase
      .from('agents')
      .select('id, force_update_version, force_update_delivered_count')
      .not('force_update_version', 'is', null)
      .limit(100);

    if (!agentsWithForce?.length) return 0;

    let cleaned = 0;
    for (const agent of agentsWithForce) {
      // Check if the target release exists
      const { data: release } = await this.supabase
        .from('agent_releases')
        .select('id')
        .eq('version', agent.force_update_version)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!release) {
        // Release doesn't exist - clean the flag
        await this.supabase
          .from('agents')
          .update({
            force_update_version: null,
            force_update_reason: null,
            force_update_delivered_count: 0,
            force_update_first_delivered_at: null,
          })
          .eq('id', agent.id);
        cleaned++;
        logger.info('[RunMaintenance] Cleaned stale force_update (release not found)', {
          agentId: agent.id,
          version: agent.force_update_version,
        });
      }
    }

    return cleaned;
  }
}
