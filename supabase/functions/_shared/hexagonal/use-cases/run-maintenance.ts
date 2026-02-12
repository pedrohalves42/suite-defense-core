/**
 * Hexagonal Use Case: Expire Jobs
 * 
 * Domain logic for maintenance operations: expiring stale jobs,
 * marking agents inactive, and archiving old executions.
 */

import { logger } from '../../logger.ts';

export interface MaintenanceResult {
  expiredJobsProcessed: number;
  offlineAgentsProcessed: number;
  archivedExecutions: number;
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

    const [expiredJobs, offlineAgents, archivedExecs] = await Promise.all([
      this.expireJobs(now),
      this.markAgentsInactive(now),
      this.archiveOldExecutions(now),
    ]);

    const durationMs = Date.now() - startedAt;

    // Report cron health
    try {
      await this.supabase.rpc('update_cron_health', {
        p_cron_name: 'maintenance-cron',
        p_success: true,
        p_details: {
          expired_jobs_processed: expiredJobs,
          offline_agents_processed: offlineAgents,
          archived_executions: archivedExecs,
          duration_ms: durationMs,
        },
      });
    } catch (err) {
      logger.warn('[RunMaintenance] Failed to update cron health', { error: err });
    }

    return {
      expiredJobsProcessed: expiredJobs,
      offlineAgentsProcessed: offlineAgents,
      archivedExecutions: archivedExecs,
      durationMs,
    };
  }

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

  private async markAgentsInactive(now: Date): Promise<number> {
    const offlineThreshold = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    const { data: offlineAgents } = await this.supabase
      .from('agents')
      .select('id')
      .eq('status', 'active')
      .lt('last_seen', offlineThreshold)
      .limit(500);

    if (!offlineAgents?.length) return 0;

    const ids = offlineAgents.map((a: { id: string }) => a.id);
    const { error } = await this.supabase
      .from('agents')
      .update({ status: 'inactive', updated_at: now.toISOString() })
      .in('id', ids);

    if (error) {
      logger.error('[RunMaintenance] Failed to mark agents inactive', { error: error.message });
      return 0;
    }

    logger.info(`[RunMaintenance] Marked ${ids.length} agents inactive`);
    return ids.length;
  }

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
}
