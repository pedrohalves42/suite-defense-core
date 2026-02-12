/**
 * Deno-compatible output ports (interfaces) for the Hexagonal Architecture.
 * These define the contracts that infrastructure adapters must implement.
 */

import type {
  Platform,
  UpdateChannel,
  DomainEvent,
} from './types.ts';

// ─── Version Info (simplified domain read model) ────────
export interface LatestVersionInfo {
  platform: Platform;
  version: string;
  packageId?: string;
}

export interface OutdatedAgentInfo {
  id: string;
  agentName: string;
  agentVersion: string;
  tenantId: string;
  platform: Platform;
}

// ─── Output Ports ───────────────────────────────────────

/**
 * Port: Retrieves latest version information per platform.
 */
export interface VersionQueryPort {
  findLatestVersions(): Promise<LatestVersionInfo[]>;
  findOutdatedAgents(platform: Platform, latestVersion: string): Promise<OutdatedAgentInfo[]>;
}

/**
 * Port: Manages update job lifecycle.
 */
export interface UpdateJobPort {
  hasPendingUpdateJob(agentId: string): Promise<boolean>;
  createUpdateJob(params: {
    agentId: string;
    agentName: string;
    tenantId: string;
    currentVersion: string;
    targetVersion: string;
    platform: string;
  }): Promise<string>;
  setForceUpdateVersion(agentId: string, version: string, reason: string): Promise<void>;
}

/**
 * Port: Observability / structured logging for cron runs.
 */
export interface ObservabilityPort {
  logScheduledJobRun(params: {
    jobKey: string;
    success: boolean;
    durationMs: number;
    result?: unknown;
    error?: string;
    processedCount: number;
    jobSource: string;
  }): Promise<void>;
}

/**
 * Port: Domain event dispatcher.
 */
export interface EventDispatcherPort {
  dispatch(event: DomainEvent): Promise<void>;
}
