/**
 * Deno-compatible Use Case: ProcessAgentUpdates
 * 
 * Orchestrates the automated update rollout cron job using hexagonal ports.
 * This replaces the monolithic inline logic in the edge function.
 */

import type {
  VersionQueryPort,
  UpdateJobPort,
  ObservabilityPort,
  EventDispatcherPort,
  OutdatedAgentInfo,
} from './ports.ts';
import type { DomainEvent } from './types.ts';
import { logger } from '../logger.ts';

// ─── Domain Events ──────────────────────────────────────
class UpdateJobCreatedEvent implements DomainEvent {
  readonly eventType = 'UpdateJobCreated';
  readonly occurredOn = new Date();
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;

  constructor(agentId: string, targetVersion: string) {
    this.aggregateId = agentId;
    this.payload = { targetVersion };
  }
}

// ─── Result types ───────────────────────────────────────
export interface PlatformResult {
  platform: string;
  outdatedCount: number;
  jobsCreated: number;
}

export interface ProcessAgentUpdatesResult {
  success: boolean;
  totalJobsCreated: number;
  platforms: PlatformResult[];
}

// ─── Use Case ───────────────────────────────────────────
export class ProcessAgentUpdatesUseCase {
  constructor(
    private readonly versionQuery: VersionQueryPort,
    private readonly updateJob: UpdateJobPort,
    private readonly observability: ObservabilityPort,
    private readonly eventDispatcher: EventDispatcherPort,
  ) {}

  async execute(requestId: string): Promise<ProcessAgentUpdatesResult> {
    const startedAt = Date.now();

    try {
      const latestVersions = await this.versionQuery.findLatestVersions();

      if (latestVersions.length === 0) {
        logger.warn('[ProcessAgentUpdates] No latest versions found', { requestId });
        return { success: true, totalJobsCreated: 0, platforms: [] };
      }

      let totalJobsCreated = 0;
      const platforms: PlatformResult[] = [];

      for (const latest of latestVersions) {
        const result = await this.processPlatform(requestId, latest.platform, latest.version);
        totalJobsCreated += result.jobsCreated;
        platforms.push(result);
      }

      const finalResult: ProcessAgentUpdatesResult = {
        success: true,
        totalJobsCreated,
        platforms,
      };

      await this.observability.logScheduledJobRun({
        jobKey: 'process-agent-updates',
        success: true,
        durationMs: Date.now() - startedAt,
        result: finalResult,
        processedCount: totalJobsCreated,
        jobSource: 'cron',
      });

      logger.info('[ProcessAgentUpdates] Completed', { requestId, totalJobsCreated });
      return finalResult;

    } catch (error) {
      const err = error as Error;

      await this.observability.logScheduledJobRun({
        jobKey: 'process-agent-updates',
        success: false,
        durationMs: Date.now() - startedAt,
        error: err.message,
        processedCount: 0,
        jobSource: 'cron',
      });

      throw error;
    }
  }

  private async processPlatform(
    requestId: string,
    platform: string,
    latestVersion: string,
  ): Promise<PlatformResult> {
    logger.info('[ProcessAgentUpdates] Processing platform', {
      requestId,
      platform,
      latestVersion,
    });

    let outdatedAgents: OutdatedAgentInfo[];
    try {
      outdatedAgents = await this.versionQuery.findOutdatedAgents(
        platform as Platform,
        latestVersion,
      );
    } catch (err) {
      logger.error('[ProcessAgentUpdates] Failed to fetch outdated agents', {
        requestId,
        platform,
        error: (err as Error).message,
      });
      return { platform, outdatedCount: 0, jobsCreated: 0 };
    }

    if (outdatedAgents.length === 0) {
      logger.info('[ProcessAgentUpdates] No outdated agents', { requestId, platform });
      return { platform, outdatedCount: 0, jobsCreated: 0 };
    }

    logger.info('[ProcessAgentUpdates] Found outdated agents', {
      requestId,
      platform,
      count: outdatedAgents.length,
    });

    let jobsCreated = 0;
    for (const agent of outdatedAgents) {
      const created = await this.processAgent(requestId, agent, latestVersion);
      if (created) jobsCreated++;
    }

    return { platform, outdatedCount: outdatedAgents.length, jobsCreated };
  }

  private async processAgent(
    requestId: string,
    agent: OutdatedAgentInfo,
    targetVersion: string,
  ): Promise<boolean> {
    // ─── GUARD: Reject downgrade attempts ─────────────
    if (this.isNewerOrEqual(agent.agentVersion, targetVersion)) {
      logger.info('[ProcessAgentUpdates] Skipping — agent already at or above target version', {
        requestId,
        agentName: agent.agentName,
        currentVersion: agent.agentVersion,
        targetVersion,
      });
      return false;
    }

    // Check for existing pending job
    const hasPending = await this.updateJob.hasPendingUpdateJob(agent.id);
    if (hasPending) {
      logger.info('[ProcessAgentUpdates] Update job already exists', {
        requestId,
        agentName: agent.agentName,
      });
      return false;
    }

    try {
      // Create job via port
      await this.updateJob.createUpdateJob({
        agentId: agent.id,
        agentName: agent.agentName,
        tenantId: agent.tenantId,
        currentVersion: agent.agentVersion,
        targetVersion,
        platform: agent.platform,
      });

      // Set force_update for legacy agent compatibility
      await this.updateJob.setForceUpdateVersion(
        agent.id,
        targetVersion,
        'Automated rollout via cron job',
      );

      // Dispatch domain event
      await this.eventDispatcher.dispatch(
        new UpdateJobCreatedEvent(agent.id, targetVersion),
      );

      logger.info('[ProcessAgentUpdates] Update job created', {
        requestId,
        agentName: agent.agentName,
        currentVersion: agent.agentVersion,
        targetVersion,
      });

      return true;
    } catch (err) {
      logger.error('[ProcessAgentUpdates] Failed to create update job', {
        requestId,
        agentName: agent.agentName,
        error: (err as Error).message,
      });
      return false;
    }
  }

  /**
   * Semver-aware comparison: returns true if current >= target.
   * Prevents downgrade jobs (e.g. v5.0.8 → v5.0.7).
   */
  private isNewerOrEqual(current: string, target: string): boolean {
    const parse = (v: string): number[] =>
      (v || '').replace(/^v/i, '').split('.').map(Number);
    const c = parse(current);
    const t = parse(target);
    for (let i = 0; i < Math.max(c.length, t.length); i++) {
      const cv = c[i] ?? 0;
      const tv = t[i] ?? 0;
      if (cv > tv) return true;
      if (cv < tv) return false;
    }
    return true; // equal
  }
}
