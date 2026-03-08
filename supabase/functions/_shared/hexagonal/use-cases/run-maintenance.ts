/**
 * Hexagonal Use Case: Run Maintenance (v2 - Optimized)
 * 
 * Delegates all heavy work to a single server-side RPC (run_maintenance_v2),
 * eliminating N+1 queries and reducing execution from ~7s to <500ms.
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
  retriggeredAgents: number;
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

    // Single RPC call replaces 3+ sequential queries + N+1 loop
    const { data, error } = await this.supabase.rpc('run_maintenance_v2', {
      p_expire_limit: 500,
      p_archive_limit: 1000,
    });

    if (error) {
      logger.error('[RunMaintenance] RPC run_maintenance_v2 failed', { error: error.message });
      throw new Error(`Maintenance RPC failed: ${error.message}`);
    }

    const result: MaintenanceResult = {
      expiredJobsProcessed: data?.expired_jobs ?? 0,
      archivedExecutions: data?.archived_executions ?? 0,
      staleForceFlagsCleaned: data?.stale_flags_cleaned ?? 0,
      retriggeredAgents: data?.retriggered_agents ?? 0,
      durationMs: Date.now() - startedAt,
    };

    logger.info('[RunMaintenance] Completed', result);

    // Fire-and-forget: cron health update is non-critical, don't block the response
    // NOTE: Supabase JS v2 .rpc() returns a PromiseLike without .catch(),
    // so we must use .then() to handle errors.
    this.supabase.rpc('update_cron_health', {
      p_cron_name: 'maintenance-cron',
      p_success: true,
      p_details: {
        expired_jobs_processed: result.expiredJobsProcessed,
        archived_executions: result.archivedExecutions,
        stale_force_flags_cleaned: result.staleForceFlagsCleaned,
        retriggered_agents: result.retriggeredAgents,
        duration_ms: result.durationMs,
      },
    }).then(({ error: healthErr }: { error: any }) => {
      if (healthErr) {
        logger.warn('[RunMaintenance] Failed to update cron health', { error: healthErr.message });
      }
    });

    return result;
  }
}
