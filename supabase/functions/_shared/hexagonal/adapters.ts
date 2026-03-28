/**
 * Deno-compatible Supabase adapters implementing the hexagonal output ports.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import type {
  VersionQueryPort,
  UpdateJobPort,
  ObservabilityPort,
  EventDispatcherPort,
  LatestVersionInfo,
  OutdatedAgentInfo,
} from './ports.ts';
import { Platform, type DomainEvent } from './types.ts';
import { logger } from '../logger.ts';

// ??? Helpers ????????????????????????????????????????????
const normalizeVersion = (v: string | null): string => v?.replace(/^v/i, '') || '';

/** Returns true if version `a` is strictly newer than `b` (semver comparison) */
const isNewerThan = (a: string, b: string): boolean => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return true;
    if (va < vb) return false;
  }
  return false; // equal
};

// ??? VersionQueryAdapter ????????????????????????????????
export class SupabaseVersionQueryAdapter implements VersionQueryPort {
  constructor(private readonly client: SupabaseClient) {}

  async findLatestVersions(): Promise<LatestVersionInfo[]> {
    const { data, error } = await this.client
      .from('agent_versions')
      .select('platform, version')
      .eq('is_latest', true);

    if (error) throw new Error(`Failed to fetch latest versions: ${error.message}`);
    if (!data || data.length === 0) return [];

    return data.map((row) => ({
      platform: row.platform as Platform,
      version: row.version,
    }));
  }

  async findOutdatedAgents(platform: Platform, latestVersion: string): Promise<OutdatedAgentInfo[]> {
    const latestNorm = normalizeVersion(latestVersion);

    const { data, error } = await this.client
      .from('agents')
      .select('id, agent_name, agent_version, tenant_id')
      .eq('status', 'active')
      .eq('os_type', platform)
      .not('agent_version', 'is', null)
      .neq('agent_version', latestVersion)        // SQL guard: exclude exact match
      .neq('agent_version', latestNorm)            // SQL guard: exclude without 'v' prefix
      .or('scheduling_paused.is.null,scheduling_paused.eq.false');

    if (error) throw new Error(`Failed to fetch agents: ${error.message}`);
    if (!data) return [];

    // Double validation: semver-aware filter in application layer
    return data
      .filter((agent) => {
        const agentNorm = normalizeVersion(agent.agent_version);
        if (agentNorm === latestNorm) return false;
        // Also reject if agent version is NEWER than target (prevent downgrade)
        if (isNewerThan(agentNorm, latestNorm)) return false;
        return true;
      })
      .map((agent) => ({
        id: agent.id,
        agentName: agent.agent_name,
        agentVersion: agent.agent_version,
        tenantId: agent.tenant_id,
        platform,
      }));
  }
}

// ??? UpdateJobAdapter ???????????????????????????????????
export class SupabaseUpdateJobAdapter implements UpdateJobPort {
  constructor(private readonly client: SupabaseClient) {}

  async hasPendingUpdateJob(agentId: string): Promise<boolean> {
    const { data } = await this.client
      .from('jobs')
      .select('id')
      .eq('agent_id', agentId)
      .eq('type', 'update_agent')
      .in('status', ['pending', 'queued', 'delivered'])
      .limit(1);

    return !!(data && data.length > 0);
  }

  async createUpdateJob(params: {
    agentId: string;
    agentName: string;
    tenantId: string;
    currentVersion: string;
    targetVersion: string;
    platform: string;
  }): Promise<string> {
    const { data, error } = await this.client
      .from('jobs')
      .insert({
        agent_id: params.agentId,
        agent_name: params.agentName,
        tenant_id: params.tenantId,
        type: 'update_agent',
        status: 'queued',
        approved: true,
        payload: {
          current_version: params.currentVersion,
          target_version: params.targetVersion,
          platform: params.platform,
          auto_triggered: true,
        },
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create update job: ${error.message}`);
    return data.id;
  }

  async setForceUpdateVersion(agentId: string, version: string, reason: string): Promise<void> {
    const { error } = await this.client
      .from('agents')
      .update({
        force_update_version: version,
        force_update_reason: reason,
      })
      .eq('id', agentId);

    if (error) {
      logger.warn('[UpdateJobAdapter] Failed to set force_update_version', {
        agentId,
        error: error.message,
      });
    }
  }
}

// ??? ObservabilityAdapter ???????????????????????????????
export class SupabaseObservabilityAdapter implements ObservabilityPort {
  constructor(private readonly client: SupabaseClient) {}

  async logScheduledJobRun(params: {
    jobKey: string;
    success: boolean;
    durationMs: number;
    result?: unknown;
    error?: string;
    processedCount: number;
    jobSource: string;
  }): Promise<void> {
    try {
      await this.client.rpc('log_scheduled_job_run', {
        p_job_key: params.jobKey,
        p_success: params.success,
        p_duration_ms: params.durationMs,
        p_result: params.success ? params.result : null,
        p_error: params.error || null,
        p_processed_count: params.processedCount,
        p_job_source: params.jobSource,
      });
    } catch (err) {
      logger.warn('[ObservabilityAdapter] Failed to log job run', {
        error: (err as Error).message,
      });
    }
  }
}

// ??? EventDispatcherAdapter ?????????????????????????????
export class LoggingEventDispatcherAdapter implements EventDispatcherPort {
  async dispatch(event: DomainEvent): Promise<void> {
    logger.info(`[DomainEvent] ${event.eventType}`, {
      aggregateId: event.aggregateId,
      payload: event.payload,
      occurredOn: event.occurredOn.toISOString(),
    });
  }
}

/**
 * Persists domain events to the domain_events table AND logs them.
 * Composite: logging + persistence in a single adapter.
 */
export class PersistingEventDispatcherAdapter implements EventDispatcherPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async dispatch(event: DomainEvent): Promise<void> {
    // Log first (always succeeds)
    logger.info(`[DomainEvent] ${event.eventType}`, {
      aggregateId: event.aggregateId,
      payload: event.payload,
      occurredOn: event.occurredOn.toISOString(),
    });

    // Persist (best-effort ? never break business logic)
    try {
      const { error } = await this.supabase.from('domain_events').insert({
        aggregate_id: event.aggregateId,
        aggregate_type: this.inferAggregateType(event.eventType),
        event_type: event.eventType,
        payload: event.payload ?? {},
        occurred_on: event.occurredOn.toISOString(),
      });

      if (error) {
        logger.error('[DomainEvent] Persist failed', { error: error.message });
      }
    } catch (err) {
      logger.error('[DomainEvent] Persist exception', { error: (err as Error).message });
    }
  }

  private inferAggregateType(eventType: string): string {
    if (eventType.startsWith('agent.') || eventType === 'UpdateJobCreated') return 'agent';
    if (eventType.startsWith('job.')) return 'job';
    if (eventType.startsWith('update.') || eventType.includes('Update')) return 'update_package';
    if (eventType.startsWith('compliance.')) return 'compliance';
    if (eventType.startsWith('lightmode.')) return 'light_mode';
    if (eventType.startsWith('security.') || eventType.startsWith('certificate.')) return 'security';
    return 'unknown';
  }
}
